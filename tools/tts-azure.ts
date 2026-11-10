// Azure Neural TTS for build scripts: SSML in, mp3 + word timings out, cached on disk by SSML.
// Uses the Speech SDK (already an app dependency) instead of the plain REST endpoint because only the SDK reports word
// boundaries, which the reference-clip gate needs to check where the peak is. Same voices, same billing as REST.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { MPEGDecoder } from "mpg123-decoder";
import type { TtsWord } from "../src/lib/synth/referenceGate.ts";
import { spokenText } from "../src/lib/synth/ssml.ts";

export const CACHE = join(tmpdir(), "myna-tts-cache");

export interface TtsClip {
  mp3: Uint8Array;
  words: TtsWord[];
}

export const usage = { requests: 0, charsBilled: 0, charsCached: 0 };

export function loadAzureEnv(): { key: string; region: string } {
  if (existsSync(".env.local")) {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = /^(AZURE_SPEECH_KEY|AZURE_SPEECH_REGION)=(.*)$/.exec(line.trim());
      if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region || !/^[a-z0-9]+$/.test(region)) {
    console.error("Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local first.");
    process.exit(1);
  }
  return { key, region };
}

function speakOnce(ssml: string, key: string, region: string): Promise<TtsClip> {
  const config = sdk.SpeechConfig.fromSubscription(key, region);
  config.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;
  const synth = new sdk.SpeechSynthesizer(config, null as unknown as sdk.AudioConfig); // null: keep the audio in memory
  const words: TtsWord[] = [];
  synth.wordBoundary = (_s, e) => {
    if (e.boundaryType === sdk.SpeechSynthesisBoundaryType.Word) {
      words.push({ text: e.text, offsetSec: e.audioOffset / 1e7, durationSec: e.duration / 1e7 });
    }
  };
  return new Promise((resolve, reject) => {
    synth.speakSsmlAsync(
      ssml,
      (r) => {
        synth.close();
        if (r.reason === sdk.ResultReason.SynthesizingAudioCompleted) resolve({ mp3: new Uint8Array(r.audioData), words });
        else reject(new Error(r.errorDetails || "synthesis failed"));
      },
      (err) => {
        synth.close();
        reject(new Error(err));
      },
    );
  });
}

/** Synthesize (or read from the cache). Retries on throttling and network errors. */
export async function synthesize(ssml: string, key: string, region: string): Promise<TtsClip> {
  mkdirSync(CACHE, { recursive: true });
  const base = join(CACHE, createHash("sha1").update(ssml).digest("hex"));
  const chars = spokenText(ssml).length;
  if (existsSync(`${base}.mp3`) && existsSync(`${base}.json`)) {
    usage.charsCached += chars;
    return { mp3: new Uint8Array(readFileSync(`${base}.mp3`)), words: JSON.parse(readFileSync(`${base}.json`, "utf8")) as TtsWord[] };
  }
  for (let tries = 0; ; tries++) {
    try {
      usage.requests++;
      const clip = await speakOnce(ssml, key, region);
      usage.charsBilled += chars;
      writeFileSync(`${base}.mp3`, clip.mp3);
      writeFileSync(`${base}.json`, JSON.stringify(clip.words));
      return clip;
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      if (/SSML|parsing|1007/i.test(msg) || tries >= 5) throw new Error(msg.replace(key, "<key>").slice(0, 300));
      const wait = 5 * (tries + 1);
      console.log(`    Azure error (${msg.slice(0, 80)}); retrying in ${wait} s`);
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }
}

export async function decodeMp3(bytes: Uint8Array): Promise<{ samples: Float32Array; sampleRate: number }> {
  const decoder = new MPEGDecoder();
  await decoder.ready;
  try {
    const out = decoder.decode(bytes);
    return { samples: out.channelData[0], sampleRate: out.sampleRate };
  } finally {
    decoder.free();
  }
}

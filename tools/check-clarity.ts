// How easy is each real-voice clip to understand? Every clip in public/audio/variants (and, as a yardstick, the plain
// readings in public/audio) is sent to Azure speech recognition with pronunciation assessment against the sentence text.
// A clip whose words the recognizer cannot get back is a clip a learner will struggle with too.
//
//   node tools/check-clarity.ts            # measure (cached), write tools/clarity-report.json
//   node tools/check-clarity.ts --apply    # also delete the unclear practice clips and rewrite the manifest
//
// Needs AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local. Results are cached by file content, so a rerun only
// sends new or changed clips.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resampleAudio } from "../src/lib/audio/resample.ts";
import { encodeWav } from "../src/lib/audio/wav.ts";
import { SENTENCES } from "../src/lib/intonation/lessons.ts";
import type { Sentence } from "../src/lib/intonation/types.ts";
import { decodeMp3, loadAzureEnv } from "./tts-azure.ts";

const VARIANTS = "public/audio/variants";
const REFS = "public/audio";
const UNITS = "content/units";
const CACHE = join(tmpdir(), "myna-clarity-cache");

/** A practice clip is unclear when the recognizer misses a word, or its accuracy is well below the plain reading's. */
const RULES = { minAccuracy: 80, maxDropFromReading: 12, maxWordErrors: 0 };

function sentences(): Map<string, Sentence> {
  const out = new Map<string, Sentence>();
  for (const unit of readdirSync(UNITS).sort())
    for (const f of readdirSync(join(UNITS, unit)).filter((x) => x.endsWith(".json")))
      for (const s of (JSON.parse(readFileSync(join(UNITS, unit, f), "utf8")) as { sentences: Sentence[] }).sentences) out.set(s.id, s);
  for (const s of SENTENCES) out.set(s.id, s);
  return out;
}

const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/** Word-level edit distance between what was said and what was heard. */
function wordErrors(ref: string[], hyp: string[]): number {
  const d = Array.from({ length: ref.length + 1 }, (_, i) => [i, ...Array<number>(hyp.length).fill(0)]);
  for (let j = 1; j <= hyp.length; j++) d[0][j] = j;
  for (let i = 1; i <= ref.length; i++)
    for (let j = 1; j <= hyp.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1));
  return d[ref.length][hyp.length];
}

interface Measure {
  heard: string;
  accuracy: number;
  completeness: number;
  wordErrors: number;
  badWords: string[];
}

interface AzureWordJson {
  Word: string;
  ErrorType?: string;
  PronunciationAssessment?: { ErrorType?: string };
}
interface AzureJson {
  RecognitionStatus: string;
  NBest?: {
    Lexical: string;
    AccuracyScore?: number;
    CompletenessScore?: number;
    PronunciationAssessment?: { AccuracyScore: number; CompletenessScore: number };
    Words?: AzureWordJson[];
  }[];
}

async function measure(file: string, text: string, key: string, region: string): Promise<Measure> {
  const bytes = new Uint8Array(readFileSync(file));
  mkdirSync(CACHE, { recursive: true });
  const cacheFile = join(CACHE, createHash("sha1").update(bytes).update(text).digest("hex") + ".json");
  if (existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, "utf8")) as Measure;
  const { samples, sampleRate } = await decodeMp3(bytes);
  const wav = encodeWav(resampleAudio(samples, sampleRate, 16000), 16000);
  const pa = Buffer.from(
    JSON.stringify({ ReferenceText: text, GradingSystem: "HundredMark", Granularity: "Word", Dimension: "Comprehensive", EnableMiscue: true }),
  ).toString("base64");
  const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed`;
  for (let tries = 0; ; tries++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
        "Pronunciation-Assessment": pa,
        Accept: "application/json",
      },
      body: new Blob([wav as Uint8Array<ArrayBuffer>]),
    });
    if (res.status === 429 && tries < 5) {
      await new Promise((r) => setTimeout(r, 3000 * (tries + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`recognition returned ${res.status}`);
    const j = (await res.json()) as AzureJson;
    const best = j.NBest?.[0];
    const heard = best?.Lexical ?? "";
    const accuracy = best?.PronunciationAssessment?.AccuracyScore ?? best?.AccuracyScore ?? 0;
    const completeness = best?.PronunciationAssessment?.CompletenessScore ?? best?.CompletenessScore ?? 0;
    const errorOf = (w: AzureWordJson) => w.PronunciationAssessment?.ErrorType ?? w.ErrorType ?? "None";
    const badWords = (best?.Words ?? []).filter((w) => errorOf(w) !== "None").map((w) => `${w.Word}:${errorOf(w)}`);
    const m: Measure = { heard, accuracy, completeness, wordErrors: wordErrors(norm(text), norm(heard)), badWords };
    writeFileSync(cacheFile, JSON.stringify(m));
    return m;
  }
}

async function main() {
  const { key, region } = loadAzureEnv();
  const apply = process.argv.includes("--apply");
  const all = sentences();
  const readings: Record<string, Measure & { file: string }> = {};
  for (const f of readdirSync(REFS).filter((x) => x.endsWith(".mp3"))) {
    const id = f.replace(/--[fm]\.mp3$/, "");
    const s = all.get(id);
    if (s) readings[f] = { file: f, ...(await measure(join(REFS, f), s.text, key, region)) };
  }
  const clips: (Measure & { file: string; id: string; variant: string; reading: number | null; unclear: boolean; why: string[] })[] = [];
  for (const f of readdirSync(VARIANTS).filter((x) => x.endsWith(".mp3")).sort()) {
    const m = /^(.+)--(falling|rising|flat|finished)\.mp3$/.exec(f);
    const s = m && all.get(m[1]);
    if (!m || !s) continue;
    const r = await measure(join(VARIANTS, f), s.text, key, region);
    const ref = [readings[`${m[1]}--f.mp3`], readings[`${m[1]}--m.mp3`]].filter(Boolean).map((x) => x.accuracy);
    const reading = ref.length ? Math.max(...ref) : null;
    const why: string[] = [];
    if (r.wordErrors > RULES.maxWordErrors) why.push(`heard "${r.heard}"`);
    if (r.accuracy < RULES.minAccuracy) why.push(`accuracy ${r.accuracy}`);
    if (reading !== null && reading - r.accuracy > RULES.maxDropFromReading) why.push(`accuracy ${r.accuracy} vs ${reading} for the plain reading`);
    clips.push({ file: f, id: m[1], variant: m[2], reading, unclear: why.length > 0, why, ...r });
    process.stdout.write(why.length ? "x" : ".");
  }
  console.log();
  const unclear = clips.filter((c) => c.unclear);
  writeFileSync(
    "tools/clarity-report.json",
    JSON.stringify(
      {
        _comment: "Made by tools/check-clarity.ts: Azure recognition + pronunciation assessment of every practice clip.",
        rules: RULES,
        unclear: unclear.map((c) => ({ file: c.file, why: c.why })),
        clips,
        readings: Object.values(readings),
      },
      null,
      2,
    ) + "\n",
  );
  const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  console.log(`plain readings: ${Object.keys(readings).length}, mean accuracy ${mean(Object.values(readings).map((r) => r.accuracy))}`);
  console.log(`practice clips: ${clips.length}, mean accuracy ${mean(clips.map((c) => c.accuracy))}, unclear ${unclear.length}`);
  for (const c of unclear.slice(0, 60)) console.log(`  ${c.file}: ${c.why.join("; ")}`);
  if (apply && unclear.length) {
    for (const c of unclear) rmSync(join(VARIANTS, c.file));
    const manifest: Record<string, string[]> = {};
    for (const f of readdirSync(VARIANTS).filter((x) => x.endsWith(".mp3")).sort()) {
      const m = /^(.+)--(falling|rising|flat|finished)\.mp3$/.exec(f);
      if (m) (manifest[m[1]] ??= []).push(m[2]);
    }
    const old = JSON.parse(readFileSync(join(VARIANTS, "manifest.json"), "utf8")) as { _comment?: string };
    writeFileSync(join(VARIANTS, "manifest.json"), JSON.stringify({ _comment: old._comment, clips: manifest }, null, 2) + "\n");
    console.log(`removed ${unclear.length} unclear clips; manifest now lists ${Object.values(manifest).flat().length}`);
  }
}

await main();

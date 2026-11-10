// Make the sound of every IPA tile (IPA practice) with Azure Neural TTS.
//
//   npm run build:ipa-sounds            # all sounds
//   npm run build:ipa-sounds -- θ ð ʃ   # only these
//
// Needs AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local. Writes public/audio/ipa/<id>.mp3 and manifest.json (the
// list the app reads to know which recordings exist). Vowels and sounds you can hold are said alone; stops and
// affricates with a schwa (pə), the way teachers say them. LISTEN TO EVERY CLIP before using it with a class: a voice
// saying a lone sound can be off. Replace any clip with your own recording (same file name), and re-run with `--manifest`
// to rebuild manifest.json from the files present.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { IPA_SOUNDS } from "../src/lib/ipa/sounds.ts";

const OUT = "public/audio/ipa";
const VOICE = "en-US-JennyNeural"; // non-HD voice: it follows <phoneme>

/** Azure's en-US phone set writes American r as ɹ and the stressed r-coloured vowel as ɝ. */
function azureIpa(say: string): string {
  return say.replace(/r/g, "ɹ").replace(/ɜ/g, "ɝ");
}

function writeManifest() {
  const ids = readdirSync(OUT)
    .filter((f) => f.endsWith(".mp3"))
    .map((f) => f.slice(0, -4))
    .sort();
  writeFileSync(`${OUT}/manifest.json`, JSON.stringify({ _comment: "Recorded IPA tile sounds. Made by tools/make-ipa-sounds.ts or added by hand.", ids }, null, 2) + "\n");
  console.log(`manifest.json lists ${ids.length} sounds`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (process.argv.includes("--manifest")) return writeManifest();

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

  const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const todo = Object.entries(IPA_SOUNDS).filter(([sym, s]) => s.kind !== "mark" && (only.length === 0 || only.includes(sym)));
  let failed = 0;
  for (const [sym, s] of todo) {
    const ssml =
      `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">` +
      `<voice name="${VOICE}"><prosody rate="-15%"><phoneme alphabet="ipa" ph="${azureIpa(s.say)}">${s.word}</phoneme></prosody></voice></speak>`;
    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "myna-ipa-sounds",
      },
      body: ssml,
    });
    if (!res.ok) {
      failed++;
      console.error(`  ${sym.padEnd(3)} ${s.id}: failed (${res.status})`);
      continue;
    }
    writeFileSync(`${OUT}/${s.id}.mp3`, Buffer.from(await res.arrayBuffer()));
    console.log(`  ${sym.padEnd(3)} ${s.id}.mp3  /${s.say}/`);
  }
  writeManifest();
  if (failed) process.exit(1);
}

await main();

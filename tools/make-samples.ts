// Generate synthetic test recordings for the lab page and the pitch-tracker test.
// Run: npm run samples   (Node 22.18+ runs this TypeScript file directly)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SENTENCES } from "../src/lib/intonation/lessons.ts";
import { encodeWav } from "../src/lib/audio/wav.ts";
import { ERROR_STYLES, synthesizeSentence, type SynthOptions } from "../src/lib/synth/voice.ts";

const outDir = join(import.meta.dirname, "..", "public", "samples");
mkdirSync(outDir, { recursive: true });

interface Variant {
  key: string;
  label: string;
  expect: string;
  opts: SynthOptions;
  when?: (id: string) => boolean;
}

const VARIANTS: Variant[] = [
  { key: "good-f", label: "Correct (female)", expect: "pass", opts: { baseHz: 210 } },
  { key: "good-m", label: "Correct (male)", expect: "pass", opts: { baseHz: 118, seed: 3 } },
  { key: "wrong-ending", label: "Wrong ending", expect: "ending fails", opts: { baseHz: 200, transform: ERROR_STYLES.wrongEnding } },
  { key: "flat", label: "Monotone", expect: "range fails", opts: { baseHz: 190, transform: ERROR_STYLES.flat } },
  {
    key: "every-word",
    label: "Tone on every word",
    expect: "one-peak warns",
    opts: { baseHz: 205, transform: ERROR_STYLES.everyWordTone },
    when: (id) => id === "fall-pretty-woman" || id.startsWith("tag-"),
  },
  {
    key: "no-pause",
    label: "No pause at comma",
    expect: "pause warns",
    opts: { baseHz: 200, noPause: true },
    when: (id) => SENTENCES.find((s) => s.id === id)!.groups.length > 1,
  },
];

const index: Record<string, { file: string; label: string; expect: string }[]> = {};
for (const s of SENTENCES) {
  index[s.id] = [];
  for (const v of VARIANTS) {
    if (v.when && !v.when(s.id)) continue;
    // 22.05 kHz keeps the files small; pitch analysis doesn't need more.
    const { samples, sampleRate } = synthesizeSentence(s, { sampleRate: 22050, ...v.opts });
    const file = `${s.id}--${v.key}.wav`;
    writeFileSync(join(outDir, file), encodeWav(samples, sampleRate));
    index[s.id].push({ file, label: v.label, expect: v.expect });
  }
}
writeFileSync(join(outDir, "index.json"), JSON.stringify(index, null, 2));
console.log(`Wrote ${Object.values(index).flat().length} samples to ${outDir}`);

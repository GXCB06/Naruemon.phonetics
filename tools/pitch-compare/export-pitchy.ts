// Step 1 of the Phase 0a pitch-tracker test: run OUR browser pipeline (pitchy + clean-up) on every WAV
// in a folder and save the F0 track as CSV, so compare.py can line it up against Praat and SwiftF0.
// Run: node tools/pitch-compare/export-pitchy.ts <wav-folder> <out-folder>
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { trackPitch } from "../../src/lib/audio/pitch.ts";
import { decodeWav } from "../../src/lib/audio/wav.ts";

const [inDir, outDir] = process.argv.slice(2);
if (!inDir || !outDir) {
  console.error("usage: node tools/pitch-compare/export-pitchy.ts <wav-folder> <out-folder>");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const files = readdirSync(inDir).filter((f) => f.toLowerCase().endsWith(".wav"));
for (const f of files) {
  const { samples, sampleRate } = decodeWav(new Uint8Array(readFileSync(join(inDir, f))));
  const frames = trackPitch(samples, sampleRate);
  const csv = ["time,hz", ...frames.map((fr) => `${fr.time.toFixed(4)},${fr.hz === null ? "" : fr.hz.toFixed(2)}`)].join("\n");
  writeFileSync(join(outDir, basename(f, ".wav") + ".pitchy.csv"), csv);
}
console.log(`pitchy: ${files.length} files → ${outDir}`);

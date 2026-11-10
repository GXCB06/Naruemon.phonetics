// Compare how well each AI reads real handwritten IPA.
//
//   node tools/compare-readers.ts [--dir recordings/handwriting] [--gemini-models gemini-3.8-flash,gemini-4-argon] [--no-claude]
//
// Samples: PNGs saved from IPA practice (open /ipa?samples=1, Write mode, "Save sample"). The file name starts with the
// word: `<word>--<anything>.png`. By default the sample is assumed to be the CORRECT transcription; if the student wrote
// something else on purpose, put what they wrote (IPA) in `<same name>.txt`. Samples stay in recordings/ (git-ignored).
//
// Reads keys from .env.local (ANTHROPIC_API_KEY, GEMINI_API_KEY). Every run calls the APIs and costs money (or free-tier
// quota). Prints, per model: exact reads, symbol accuracy, average time, and every misread.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { aiJson, CLAUDE_MODEL, DEFAULT_GEMINI_MODEL, type AiProvider } from "../src/lib/ai/aiServer.ts";
import { parseReading, READ_PROMPT, READ_SCHEMA } from "../src/lib/ai/readIpa.ts";
import { alignSymbols, parseIpa, practiceWords } from "../src/lib/ipa/practice.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

// .env.local → process.env (only the keys this script needs)
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = /^(ANTHROPIC_API_KEY|GEMINI_API_KEY|GEMINI_MODEL)=(.*)$/.exec(line.trim());
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const dir = arg("--dir") ?? "recordings/handwriting";
if (!existsSync(dir)) {
  console.error(`No samples folder: ${dir}\nSave samples from /ipa?samples=1 (Write mode → "Save sample") into that folder.`);
  process.exit(1);
}
const answers = new Map(practiceWords().map((w) => [w.word, w.tokens]));
const samples = readdirSync(dir)
  .filter((f) => f.toLowerCase().endsWith(".png"))
  .map((f) => {
    const word = f.split("--")[0].toLowerCase();
    const txt = join(dir, f.replace(/\.png$/i, ".txt"));
    const written = existsSync(txt) ? parseIpa(readFileSync(txt, "utf8").trim()) : answers.get(word);
    return { file: f, word, written, png: readFileSync(join(dir, f)).toString("base64") };
  })
  .filter((s): s is typeof s & { written: string[] } => {
    if (!s.written) console.warn(`skip ${s.file}: "${s.word}" is not a practice word and has no .txt`);
    return Boolean(s.written);
  });
if (!samples.length) {
  console.error("No usable samples.");
  process.exit(1);
}

const candidates: { label: string; provider: AiProvider; model?: string }[] = [];
if (process.env.ANTHROPIC_API_KEY && !process.argv.includes("--no-claude")) candidates.push({ label: CLAUDE_MODEL, provider: "claude" });
if (process.env.GEMINI_API_KEY)
  for (const m of (arg("--gemini-models") ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL).split(",").map((x) => x.trim()).filter(Boolean))
    candidates.push({ label: m, provider: "gemini", model: m });
if (!candidates.length) {
  console.error("No AI key in .env.local (ANTHROPIC_API_KEY or GEMINI_API_KEY).");
  process.exit(1);
}

console.log(`${samples.length} samples × ${candidates.length} model(s)\n`);
for (const c of candidates) {
  if (c.model) process.env.GEMINI_MODEL = c.model;
  let exact = 0;
  let symbols = 0;
  let correctSymbols = 0;
  let ms = 0;
  const misses: string[] = [];
  for (const s of samples) {
    const t0 = Date.now();
    const r = await aiJson(
      { turns: [{ role: "user", content: READ_PROMPT }], png: s.png, schema: READ_SCHEMA, effort: "high", maxTokens: 8000 },
      c.provider,
    );
    ms += Date.now() - t0;
    const reading = r.ok ? parseReading(r.text) : null;
    const got = reading ? parseIpa(reading.ipa).filter((x) => !x.startsWith("?")) : [];
    const { ops } = alignSymbols(s.written, got);
    const errors = ops.length;
    symbols += s.written.length;
    correctSymbols += Math.max(0, s.written.length - errors);
    if (errors === 0 && r.ok) exact++;
    else misses.push(`  ${s.file}: wrote /${s.written.join("")}/, read ${r.ok ? `/${got.join("")}/` : `(${r.reason})`}`);
  }
  console.log(
    `${c.label}\n  exact reads: ${exact}/${samples.length} (${Math.round((100 * exact) / samples.length)}%)` +
      `  symbol accuracy: ${Math.round((100 * correctSymbols) / Math.max(1, symbols))}%  avg time: ${(ms / samples.length / 1000).toFixed(1)} s`,
  );
  if (misses.length) console.log(misses.join("\n"));
  console.log("");
}

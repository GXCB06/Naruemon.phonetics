// Real-voice practice clips for "Which one is the falling / rising tune?" and "Match the pairs": every lesson sentence spoken
// by a real neural voice once per tune (falling, rising, flat, and "finished" for sentences with an open part), each clip
// checked with our own pitch pipeline so the tune is the one it claims to be.
//
//   npm run build:variants                          # every sentence; skips clips that already passed
//   npm run build:variants -- falling-1-book-table  # only these sentence ids
//   npm run build:variants -- --force               # redo clips that already have a verdict
//   npm run build:variants -- --manifest            # rebuild manifest.json from the mp3 files present (no Azure calls)
//
// Needs AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local. Female voice only (Jenny): a pair of clips must share one
// voice, and one voice halves the files. For each clip it builds the sentence the variant stands for
// (src/lib/synth/variants.ts), makes SSML with the same ladder as the reference clips, decodes the mp3 and gates it:
//  - falling / rising / finished: the rule engine on the variant's own pattern (analyzeReference + gateReference), with
//    Azure's word timings so the peak position is checked too
//  - flat: `flatGate` (no clear peak, no clear rise or fall at the end)
// A clip that never passes is simply left out; the app then plays the synthetic voice for that whole exercise (a real voice
// never sits next to a synthetic one). They are listed in public/audio/variants/report.json for a human recording
// (public/audio/variants/<id>--<variant>.mp3, then --manifest). The textbook ending of a sentence reuses its existing
// reference clip (public/audio/<id>--f.mp3), so a pair is always one voice and one pipeline.
//
//   npm run build:variants -- --second-voice        # for sentences still without a real falling+rising pair, also try the male
//                                                   # voice (Jason, the same voice as the --m reference clips) and keep the voice
//                                                   # that gives the sentence the most clips. A sentence always keeps ONE voice.
// LISTEN to new clips before using them with a class: the gate checks the tune, not how natural it sounds.

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SENTENCES } from "../src/lib/intonation/lessons.ts";
import type { Sentence } from "../src/lib/intonation/types.ts";
import type { ClipVariant } from "../src/lib/learn/exercises.ts";
import { analyzeReference, gateReference } from "../src/lib/synth/referenceGate.ts";
import { buildSsml, escapeXml, type SsmlOptions } from "../src/lib/synth/ssml.ts";
import { flatGate, REAL_VARIANTS, variantSentence, variantsToMake } from "../src/lib/synth/variants.ts";
import { decodeMp3, loadAzureEnv, synthesize, usage } from "./tts-azure.ts";

const OUT = "public/audio/variants";
const REF = "public/audio";
const UNITS = "content/units";
const VOICE = "en-US-JennyNeural";
const VOICE_M = "en-US-JasonNeural";

/** The female ladder from tools/make-tts.ts (chosen by testing 15 variants on all sentences). */
const LADDER: SsmlOptions[] = [
  { prePct: -8, gain: 1.4, basePct: 15, punctuation: "pattern" },
  { prePct: -12, gain: 1.5, punctuation: "pattern" },
  { prePct: -20, gain: 1.7, fallGain: 1.4, punctuation: "pattern" },
  { shape: "group", gain: 1.5, punctuation: "pattern" },
  { prePct: -8, gain: 1.3 },
  { prePct: -8, gain: 1.4, basePct: 15 },
];
/** The male ladder from tools/make-tts.ts (Jason). */
const LADDER_M: SsmlOptions[] = [
  { prePct: -8, gain: 1.3 },
  { gain: 1.4, fallGain: 1.6, punctuation: "pattern" },
  { shape: "none" },
  { shape: "group" },
  { prePct: -20, gain: 1.7, fallGain: 1.4, punctuation: "pattern" },
];

/**
 * Flat: a neural voice always sinks toward the end of a phrase, so a plain reading is not flat. One contour over each
 * group that starts low and climbs by `end` % cancels that sinking (tuned by testing; the gate checks the result).
 */
const FLAT_LADDER: { start: number; end: number }[] = [
  { start: -6, end: 8 },
  { start: -10, end: 14 },
  { start: -14, end: 22 },
  { start: -4, end: 4 },
  { start: -18, end: 30 },
  { start: -24, end: 40 },
  { start: -30, end: 55 },
];

function flatSsml(s: Sentence, slope: { start: number; end: number }, voice = VOICE): string {
  const sign = (n: number) => `${n >= 0 ? "+" : ""}${n}%`;
  const parts = s.groups.map((g) => {
    const text = escapeXml(g.words.map((w) => w.text).join(" ").replace(/[.?!;:,]+$/, "") + ",");
    return `<prosody contour="(0%,${sign(slope.start)}) (50%,${sign(Math.round((slope.start + slope.end) / 2))}) (100%,${sign(slope.end)})">${text}</prosody>`;
  });
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="${voice}">` +
    parts.join(`<break time="200ms"/>`) +
    `</voice></speak>`
  );
}

interface ClipReport {
  id: string;
  variant: ClipVariant;
  /** Which voice made the clip: "f" (Jenny) or "m" (Jason). A sentence keeps one voice for all its clips. */
  voice?: "f" | "m";
  pass: boolean;
  /** "reference" = copied from the existing reference clip; otherwise the index in the ladder. */
  kept: number | "reference" | null;
  why: string[];
  signature: string;
}

function lessonSentences(): Sentence[] {
  const out: Sentence[] = [];
  for (const unit of readdirSync(UNITS).sort()) {
    for (const file of readdirSync(join(UNITS, unit)).filter((f) => f.endsWith(".json")).sort()) {
      const lesson = JSON.parse(readFileSync(join(UNITS, unit, file), "utf8")) as { sentences: Sentence[] };
      out.push(...lesson.sentences);
    }
  }
  return [...out, ...SENTENCES];
}

function signature(s: Sentence, v: ClipVariant): string {
  const tune = s.groups.map((g) => [g.pattern, g.words.map((w) => [w.text, w.syllables.map((y) => y.levels)])]);
  return createHash("sha1").update(JSON.stringify([tune, v, LADDER, FLAT_LADDER, VOICE])).digest("hex").slice(0, 12);
}

function writeManifest() {
  const clips: Record<string, ClipVariant[]> = {};
  for (const f of readdirSync(OUT).filter((f) => f.endsWith(".mp3")).sort()) {
    const m = /^(.+)--(falling|rising|flat|finished)\.mp3$/.exec(f);
    if (m) (clips[m[1]] ??= []).push(m[2] as ClipVariant);
  }
  const comment =
    "Real-voice practice clips per sentence id and tune (made by tools/make-variants.ts, or added by hand then run npm run build:variants -- --manifest). The app uses them only when every clip an exercise needs exists.";
  writeFileSync(`${OUT}/manifest.json`, JSON.stringify({ _comment: comment, clips }, null, 2) + "\n");
  console.log(`manifest.json lists ${Object.keys(clips).length} sentences, ${Object.values(clips).flat().length} clips`);
}

/** How good a sentence's set of clips is: the falling+rising pair counts most (that is what "Hear it" needs), then the rest. */
function setScore(clips: readonly ClipReport[]): number {
  const ok = (v: ClipVariant) => clips.some((c) => c.variant === v && c.pass);
  return (ok("falling") && ok("rising") ? 100 : 0) + (ok("falling") ? 10 : 0) + (ok("rising") ? 10 : 0) + (ok("flat") ? 3 : 0) + (ok("finished") ? 3 : 0);
}

/**
 * For every sentence still without a real falling+rising pair, try the male voice (Jason) as well and keep whichever voice
 * gives the sentence the better set. All clips of a sentence always come from one voice, so a pair never mixes two voices.
 */
async function secondVoice(all: Sentence[], only: string[], reports: Map<string, ClipReport>, reportFile: string, key: string, region: string) {
  const tmp = join(tmpdir(), "myna-variants-m");
  mkdirSync(tmp, { recursive: true });
  for (const sentence of all) {
    if (only.length && !only.includes(sentence.id)) continue;
    const variants = variantsToMake(sentence);
    const current = variants.map((v) => reports.get(`${sentence.id}|${v}`)).filter((r): r is ClipReport => !!r);
    if (current.length === 0 || current.every((c) => c.voice === "m")) continue;
    const pairNow = current.some((c) => c.variant === "falling" && c.pass) && current.some((c) => c.variant === "rising" && c.pass);
    if (pairNow) continue;
    console.log(`${sentence.id}: no real pair with Jenny, trying Jason`);
    const male: ClipReport[] = [];
    for (const variant of variants) {
      const vs = variantSentence(sentence, variant);
      if (!vs) continue;
      const target = join(tmp, `${sentence.id}--${variant}.mp3`);
      const reference = `${REF}/${sentence.id}--m.mp3`;
      let g: { pass: boolean; kept: number | null; why: string[] };
      if (vs === sentence && (variant === "falling" || variant === "rising") && existsSync(reference)) {
        copyFileSync(reference, target);
        g = { pass: true, kept: null, why: [] };
        console.log(`  m: reference clip for ${variant}`);
      } else g = await generate(vs, variant, "m", target, key, region);
      male.push({ id: sentence.id, variant, voice: "m", pass: g.pass, kept: g.pass ? (g.kept ?? "reference") : null, why: g.why, signature: signature(sentence, variant) + "m" });
    }
    if (setScore(male) > setScore(current)) {
      console.log(`  -> Jason wins (${setScore(male)} vs ${setScore(current)}): replacing this sentence's clips`);
      for (const v of variants) {
        const f = `${OUT}/${sentence.id}--${v}.mp3`;
        if (existsSync(f)) rmSync(f);
      }
      for (const c of male) {
        const from = join(tmp, `${sentence.id}--${c.variant}.mp3`);
        if (c.pass && existsSync(from)) copyFileSync(from, `${OUT}/${sentence.id}--${c.variant}.mp3`);
        reports.set(`${sentence.id}|${c.variant}`, c);
      }
      writeFileSync(reportFile, JSON.stringify({ clips: [...reports.values()] }, null, 2) + "\n");
    } else console.log(`  -> Jenny keeps it (${setScore(current)} vs ${setScore(male)})`);
  }
}

/** Make one clip with one voice: walk the ladder until a clip passes its gate, and write it to `target`. */
async function generate(
  vs: Sentence,
  variant: ClipVariant,
  voiceId: "f" | "m",
  target: string,
  key: string,
  region: string,
): Promise<{ pass: boolean; kept: number | null; why: string[] }> {
  const voiceName = voiceId === "f" ? VOICE : VOICE_M;
  const ladder: (SsmlOptions | { start: number; end: number })[] = variant === "flat" ? FLAT_LADDER : voiceId === "f" ? LADDER : LADDER_M;
  let why: string[] = [];
  for (const [i, options] of ladder.entries()) {
    const ssml = variant === "flat" ? flatSsml(vs, options as { start: number; end: number }, voiceName) : buildSsml(vs, voiceName, options as SsmlOptions);
    const tts = await synthesize(ssml, key, region);
    const { samples, sampleRate } = await decodeMp3(tts.mp3);
    let pass: boolean;
    let reasons: string[];
    if (variant === "flat") {
      const g = flatGate(samples, sampleRate);
      pass = g.pass;
      reasons = g.reasons;
    } else {
      const a = analyzeReference(samples, sampleRate, vs, tts.words);
      const gate = gateReference(a.result);
      pass = gate.pass && a.aligned;
      reasons = a.aligned || !gate.pass ? gate.reasons : ["peak position not checked (words not aligned)"];
    }
    if (pass) {
      writeFileSync(target, tts.mp3);
      console.log(`  ${voiceId}: pass on attempt ${i + 1}`);
      return { pass: true, kept: i, why: [] };
    }
    why = reasons;
  }
  if (existsSync(target)) rmSync(target);
  console.log(`  ${voiceId}: FAILED all ${ladder.length} attempts: ${why.join("; ").slice(0, 140)}`);
  return { pass: false, kept: null, why };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (process.argv.includes("--manifest")) return writeManifest();
  const { key, region } = loadAzureEnv();
  const force = process.argv.includes("--force");
  const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const all = lessonSentences();
  const unknown = only.filter((id) => !all.some((s) => s.id === id));
  if (unknown.length) {
    console.error(`Unknown sentence id(s): ${unknown.join(", ")}`);
    process.exit(1);
  }

  const reportFile = `${OUT}/report.json`;
  const reports = new Map<string, ClipReport>();
  if (existsSync(reportFile)) {
    const old = JSON.parse(readFileSync(reportFile, "utf8")) as { clips?: ClipReport[] };
    for (const r of old.clips ?? []) reports.set(`${r.id}|${r.variant}`, r);
  }

  for (const sentence of all) {
    if (only.length && !only.includes(sentence.id)) continue;
    for (const variant of variantsToMake(sentence)) {
      const k = `${sentence.id}|${variant}`;
      const sig = signature(sentence, variant);
      const target = `${OUT}/${sentence.id}--${variant}.mp3`;
      const done = reports.get(k);
      if (!force && done?.voice === "m" && done.pass === existsSync(target)) continue; // chosen from the second voice
      if (!force && done?.signature === sig && done.pass === existsSync(target)) continue;
      const vs = variantSentence(sentence, variant);
      if (!vs) continue;
      const report: ClipReport = { id: sentence.id, variant, pass: false, kept: null, why: [], signature: sig };

      // the textbook ending reuses the reference clip, so both clips of a pair come from one voice and one pipeline
      const reference = `${REF}/${sentence.id}--f.mp3`;
      if (vs === sentence && (variant === "falling" || variant === "rising") && existsSync(reference)) {
        copyFileSync(reference, target);
        report.pass = true;
        report.kept = "reference";
        console.log(`${sentence.id} ${variant}: reference clip`);
        reports.set(k, report);
        continue;
      }

      console.log(`${sentence.id} ${variant}  "${sentence.text}"`);
      const g = await generate(vs, variant, "f", target, key, region);
      report.pass = g.pass;
      report.kept = g.kept;
      report.why = g.why;
      report.voice = "f";
      reports.set(k, report);
      // save as we go: a long run can be stopped and resumed
      writeFileSync(reportFile, JSON.stringify({ clips: [...reports.values()] }, null, 2) + "\n");
    }
  }

  if (process.argv.includes("--second-voice")) await secondVoice(all, only, reports, reportFile, key, region);

  // forget clips of sentences that no longer exist
  for (const [k, r] of reports) {
    if (all.some((s) => s.id === r.id)) continue;
    reports.delete(k);
    const f = `${OUT}/${r.id}--${r.variant}.mp3`;
    if (existsSync(f)) rmSync(f);
  }

  const ordered = [...reports.values()];
  const failed = ordered.filter((r) => !r.pass).map((r) => ({ id: r.id, variant: r.variant, why: r.why.join("; ").slice(0, 200) }));
  const byVariant = Object.fromEntries(REAL_VARIANTS.map((v) => [v, `${ordered.filter((r) => r.variant === v && r.pass).length}/${ordered.filter((r) => r.variant === v).length}`]));
  writeFileSync(
    reportFile,
    JSON.stringify(
      {
        _comment:
          "Made by tools/make-variants.ts. needsHumanRecording: clips where Azure never produced the asked-for tune in our analysis; record them as public/audio/variants/<id>--<variant>.mp3 and run `npm run build:variants -- --manifest`. Exercises that need a missing clip play the synthetic voice instead.",
        passed: byVariant,
        needsHumanRecording: failed,
        clips: ordered,
      },
      null,
      2,
    ) + "\n",
  );
  writeManifest();
  console.log("Passed per tune:", byVariant, `| ${failed.length} clips need a human recording`);
  console.log(`Azure: ${usage.requests} requests, ${usage.charsBilled} characters billed this run (${usage.charsCached} more from the cache).`);
}

await main();

// Reference audio for every lesson sentence (task B6) with Azure Neural TTS, checked by our own pitch pipeline.
//
//   npm run build:tts                                 # every sentence (content/units/** + the 6 lab sentences); skips unchanged ones
//   npm run build:tts -- tags-1-harry rise-student    # only these sentence ids
//   npm run build:tts -- --force                      # redo sentences that already have a verdict
//   npm run build:tts -- --manifest                   # rebuild manifest.json from the mp3 files present (no Azure calls)
//
// Needs AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local. For each sentence and each voice (female "f", male "m")
// it shapes the tune with SSML <prosody> (src/lib/synth/ssml.ts), decodes the mp3 and checks it with our own pipeline:
// analyzeVoice (the lab's voice path) plus the word timings Azure TTS reports, mapped onto our syllables by the B3 aligner,
// so the rule engine also checks WHERE the peak is (src/lib/synth/referenceGate.ts). A clip is kept only when it passes
// its own pattern; otherwise the next SSML variant in ATTEMPTS is tried. Azure follows <prosody> loosely and
// unpredictably (it ignores some contours outright), so the ladder tries several shapes rather than one formula.
// Sentences that never pass are listed in public/audio/report.json under needsHumanRecording.
//
// Writes public/audio/<sentenceId>--f.mp3 / --m.mp3, public/audio/manifest.json (what the app reads) and
// public/audio/report.json. Never touches public/audio/ipa/. Azure results are cached by SSML in the OS temp folder, so a
// re-run only pays for SSML that changed. A human recording can replace any clip (same file name; then run --manifest).
// LISTEN to new clips before using them with a class: the gate checks the tune, not how natural it sounds.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SENTENCES } from "../src/lib/intonation/lessons.ts";
import type { Sentence } from "../src/lib/intonation/types.ts";
import { analyzeReference, gateReference } from "../src/lib/synth/referenceGate.ts";
import { buildSsml, TTS_VOICES, type SsmlOptions, type VoiceId } from "../src/lib/synth/ssml.ts";
import { decodeMp3, loadAzureEnv, synthesize, usage } from "./tts-azure.ts";

const OUT = "public/audio";
const UNITS = "content/units";

/**
 * SSML variants per voice, tried in order until one passes (see SsmlOptions in src/lib/synth/ssml.ts). Chosen by testing
 * 15 variants on all 61 sentences (Nov 2026) and keeping, greedily, the ones that added passing sentences. Azure honours
 * per-word pitch far better than one contour over a phrase, and both voices like to accent the first content word, so
 * most variants lower the run-up (prePct) and push the nucleus (gain). Jenny keeps her lows voiced with a raised base.
 */
const ATTEMPTS: Record<VoiceId, SsmlOptions[]> = {
  f: [
    { prePct: -8, gain: 1.4, basePct: 15, punctuation: "pattern" },
    { prePct: -12, gain: 1.5, punctuation: "pattern" },
    { prePct: -20, gain: 1.7, fallGain: 1.4, punctuation: "pattern" },
    { shape: "group", gain: 1.5, punctuation: "pattern" },
    { prePct: -8, gain: 1.3 },
    { prePct: -8, gain: 1.4, basePct: 15 },
  ],
  m: [
    { prePct: -8, gain: 1.3 },
    { gain: 1.4, fallGain: 1.6, punctuation: "pattern" },
    { shape: "none" },
    { shape: "group" },
    { prePct: -20, gain: 1.7, fallGain: 1.4, punctuation: "pattern" },
  ],
};

interface AttemptReport {
  options: SsmlOptions;
  pass: boolean;
  overall: number | null;
  aligned: boolean;
  reasons: string[];
  warnings: string[];
}
interface ClipReport {
  voice: VoiceId;
  pass: boolean;
  /** Index into ATTEMPTS[voice] of the kept clip. */
  kept: number | null;
  attempts: AttemptReport[];
}
interface SentenceReport {
  id: string;
  text: string;
  patterns: string;
  /** Changes when the sentence's words, levels, the voices or the attempts change, so unchanged sentences are skipped. */
  signature: string;
  clips: ClipReport[];
}

function lessonSentences(): Sentence[] {
  const out: Sentence[] = [];
  for (const unit of readdirSync(UNITS).sort()) {
    for (const file of readdirSync(join(UNITS, unit)).filter((f) => f.endsWith(".json")).sort()) {
      const lesson = JSON.parse(readFileSync(join(UNITS, unit, file), "utf8")) as { sentences: Sentence[] };
      out.push(...lesson.sentences);
    }
  }
  return [...out, ...SENTENCES]; // the lab's 6 test sentences too
}

function signature(s: Sentence): string {
  const tune = s.groups.map((g) => [g.pattern, g.words.map((w) => [w.text, w.syllables.map((y) => y.levels)])]);
  return createHash("sha1").update(JSON.stringify([tune, TTS_VOICES, ATTEMPTS])).digest("hex").slice(0, 12);
}

function writeManifest() {
  const clips: Record<string, VoiceId[]> = {};
  for (const f of readdirSync(OUT).filter((f) => f.endsWith(".mp3")).sort()) {
    const m = /^(.+)--([fm])\.mp3$/.exec(f);
    if (m) (clips[m[1]] ??= []).push(m[2] as VoiceId);
  }
  const comment =
    "Reference clips per sentence id (f = female, m = male) that passed their own pattern. Made by tools/make-tts.ts (npm run build:tts) or added by hand (then run npm run build:tts -- --manifest).";
  writeFileSync(`${OUT}/manifest.json`, JSON.stringify({ _comment: comment, clips }, null, 2) + "\n");
  console.log(`manifest.json lists ${Object.keys(clips).length} sentences`);
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
  const previous: Record<string, SentenceReport> = {};
  if (existsSync(reportFile)) {
    const old = JSON.parse(readFileSync(reportFile, "utf8")) as { sentences?: SentenceReport[] };
    for (const r of old.sentences ?? []) previous[r.id] = r;
  }
  const reports: Record<string, SentenceReport> = { ...previous };

  for (const sentence of all) {
    if (only.length && !only.includes(sentence.id)) continue;
    const sig = signature(sentence);
    const done = previous[sentence.id];
    const patterns = sentence.groups.map((g) => g.pattern).join(" ");
    const filesOk = done?.clips.every((c) => c.pass === existsSync(`${OUT}/${sentence.id}--${c.voice}.mp3`));
    if (!force && done?.signature === sig && filesOk) continue;
    console.log(`${sentence.id}  "${sentence.text}"  [${patterns}]`);
    const clips: ClipReport[] = [];
    for (const voice of TTS_VOICES) {
      const clip: ClipReport = { voice: voice.id, pass: false, kept: null, attempts: [] };
      const target = `${OUT}/${sentence.id}--${voice.id}.mp3`;
      for (const [i, options] of ATTEMPTS[voice.id].entries()) {
        const tts = await synthesize(buildSsml(sentence, voice.name, options), key, region);
        const { samples, sampleRate } = await decodeMp3(tts.mp3);
        const a = analyzeReference(samples, sampleRate, sentence, tts.words);
        const gate = gateReference(a.result);
        // a clip whose words could not all be lined up is not trusted: its peak position was not checked
        const pass = gate.pass && a.aligned;
        const reasons = a.aligned || !gate.pass ? gate.reasons : ["peak position not checked (words not aligned)"];
        clip.attempts.push({ options, pass, overall: gate.overall, aligned: a.aligned, reasons, warnings: gate.warnings });
        if (pass) {
          writeFileSync(target, tts.mp3);
          clip.pass = true;
          clip.kept = i;
          console.log(`  ${voice.id}: pass on attempt ${i + 1} (score ${gate.overall})`);
          break;
        }
      }
      if (!clip.pass) {
        if (existsSync(target)) rmSync(target); // an old clip that no longer matches the sentence
        console.log(`  ${voice.id}: FAILED all ${ATTEMPTS[voice.id].length} attempts: ${clip.attempts.at(-1)?.reasons.join("; ")}`);
      }
      clips.push(clip);
    }
    reports[sentence.id] = { id: sentence.id, text: sentence.text, patterns, signature: sig, clips };
  }

  // Forget sentences that no longer exist (and their clips).
  for (const id of Object.keys(reports)) {
    if (all.some((s) => s.id === id)) continue;
    delete reports[id];
    for (const v of TTS_VOICES) if (existsSync(`${OUT}/${id}--${v.id}.mp3`)) rmSync(`${OUT}/${id}--${v.id}.mp3`);
  }

  const ordered = all.map((s) => reports[s.id]).filter((r): r is SentenceReport => !!r);
  /** The most common reason over a voice's attempts, as a one-line "why". */
  const why = (c: ClipReport) => {
    const n = new Map<string, number>();
    for (const a of c.attempts) {
      // "group 1 (2-3-1) ending: fail (long message)" -> "group 1 (2-3-1) ending: fail", counted once per attempt
      for (const k of new Set(a.reasons.map((r) => /^(.*?: \w+)/.exec(r)?.[1] ?? r))) n.set(k, (n.get(k) ?? 0) + 1);
    }
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r, k]) => `${r} in ${k}/${c.attempts.length} attempts`).join("; ");
  };
  const needsHuman = ordered
    .filter((r) => r.clips.some((c) => !c.pass))
    .map((r) => ({
      id: r.id,
      text: r.text,
      patterns: r.patterns,
      missing: r.clips.filter((c) => !c.pass).map((c) => c.voice),
      why: Object.fromEntries(r.clips.filter((c) => !c.pass).map((c) => [c.voice, why(c)])),
    }));
  writeFileSync(
    reportFile,
    JSON.stringify(
      {
        _comment:
          "Made by tools/make-tts.ts. needsHumanRecording: sentences where an Azure voice never passed its own pattern in our analysis; record them as public/audio/<id>--f.mp3 / --m.mp3 and run `npm run build:tts -- --manifest`. The app plays the placeholder voice for these until then.",
        voices: TTS_VOICES,
        attempts: ATTEMPTS,
        needsHumanRecording: needsHuman,
        sentences: ordered,
      },
      null,
      2,
    ) + "\n",
  );
  writeManifest();
  const both = ordered.filter((r) => r.clips.every((c) => c.pass)).length;
  console.log(`${both}/${ordered.length} sentences have both clips; ${needsHuman.length} need a human recording for at least one voice.`);
  console.log(`Azure: ${usage.requests} requests, ${usage.charsBilled} characters billed this run (${usage.charsCached} more from the cache).`);
}

await main();

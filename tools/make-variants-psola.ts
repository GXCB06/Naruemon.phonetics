// Practice clips made by RE-PITCHING one natural reading (see src/lib/synth/psola.ts), for the sentences where asking the neural
// voice for a falling / rising / flat tune did not work (tools/make-variants.ts).
//
//   npm run build:variants:psola                         # every sentence that is missing a clip of any tune
//   npm run build:variants:psola -- class2-03a-do-you-work   # only these sentence ids
//   npm run build:variants:psola -- --all                # redo every sentence this way
//
// Needs AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local (it asks for one plain reading per sentence; cached on disk).
// For each sentence it
//   1. gets ONE natural reading (no pitch markup) and the word timings the voice reports, in the voice the sentence already uses
//      (so one sentence is always one voice),
//   2. finds its pitch and its speaker baseline (level 2),
//   3. for every tune the sentence needs (falling, rising, flat, "finished" when a part is open) builds the exact pitch line from
//      the tune's levels (src/lib/synth/targetPitch.ts) and re-pitches the reading onto it,
//   4. checks every result with the same gates as the other clips (the rule engine for tunes, flatGate for flat),
//   5. keeps the new set for the sentence only when it is better than what it had, and then ALL of the sentence's clips come from
//      this method, so a pair never mixes two kinds of processing.
// The result is written as public/audio/variants/<id>--<tune>.mp3 (MP3 via lamejs, LGPL, used only in this build script),
// recorded in report.json with kept: "psola", and listed in manifest.json. A human recording of the same name still wins:
// drop it in and run `npm run build:variants -- --manifest`.
// LISTEN to new clips before using them with a class: the gate checks the tune, not how natural it sounds.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Mp3Encoder } from "@breezystack/lamejs";
import { trackPitch } from "../src/lib/audio/pitch.ts";
import { SENTENCES } from "../src/lib/intonation/lessons.ts";
import type { Sentence } from "../src/lib/intonation/types.ts";
import type { ClipVariant } from "../src/lib/learn/exercises.ts";
import { repitch } from "../src/lib/synth/psola.ts";
import { analyzeReference, gateReference } from "../src/lib/synth/referenceGate.ts";
import { buildSsml } from "../src/lib/synth/ssml.ts";
import { syllablePlan, targetLine } from "../src/lib/synth/targetPitch.ts";
import { flatGate, variantSentence, variantsToMake } from "../src/lib/synth/variants.ts";
import { decodeMp3, loadAzureEnv, synthesize, usage } from "./tts-azure.ts";

const OUT = "public/audio/variants";
const UNITS = "content/units";
const SPREADS = [4, 5, 6.5];
const VOICES = { f: "en-US-JennyNeural", m: "en-US-JasonNeural" } as const;

interface ClipReport {
  id: string;
  variant: ClipVariant;
  voice?: "f" | "m";
  pass: boolean;
  kept: number | "reference" | "psola" | null;
  /** "ending": the ending is right but the peak is not placed perfectly (a looser gate, used for practice clips only). */
  grade?: "strict" | "ending";
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

function mp3(samples: Float32Array, sampleRate: number): Uint8Array {
  const enc = new Mp3Encoder(1, sampleRate, 64);
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767)));
  const chunks: Uint8Array[] = [];
  const block = 1152 * 8;
  for (let i = 0; i < pcm.length; i += block) {
    const part = enc.encodeBuffer(pcm.subarray(i, i + block));
    if (part.length) chunks.push(Uint8Array.from(part));
  }
  const end = enc.flush();
  if (end.length) chunks.push(Uint8Array.from(end));
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** The looser tier: every thought group ends the way the tune says (the ending check passes) and the voice has a real range. */
function endingGate(result: Parameters<typeof gateReference>[0]): boolean {
  if (!result) return false;
  return result.groups.every((g) => g.checks.every((c) => (c.id === "ending" ? c.status === "pass" : c.id === "range" ? c.status !== "fail" : true)));
}

const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

/** How good a sentence's set of clips is: the falling+rising pair counts most, then the rest (same scale as make-variants.ts). */
function setScore(ok: (v: ClipVariant) => boolean): number {
  return (ok("falling") && ok("rising") ? 100 : 0) + (ok("falling") ? 10 : 0) + (ok("rising") ? 10 : 0) + (ok("flat") ? 3 : 0) + (ok("finished") ? 3 : 0);
}

function writeManifest() {
  const clips: Record<string, ClipVariant[]> = {};
  for (const f of readdirSync(OUT).filter((f) => f.endsWith(".mp3")).sort()) {
    const m = /^(.+)--(falling|rising|flat|finished)\.mp3$/.exec(f);
    if (m) (clips[m[1]] ??= []).push(m[2] as ClipVariant);
  }
  const comment =
    "Real-voice practice clips per sentence id and tune (made by tools/make-variants.ts and tools/make-variants-psola.ts, or added by hand then run npm run build:variants -- --manifest). The app uses them only when every clip an exercise needs exists.";
  writeFileSync(`${OUT}/manifest.json`, JSON.stringify({ _comment: comment, clips }, null, 2) + "\n");
  console.log(`manifest.json lists ${Object.keys(clips).length} sentences, ${Object.values(clips).flat().length} clips`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { key, region } = loadAzureEnv();
  const doAll = process.argv.includes("--all");
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
  const have = (id: string, v: ClipVariant) => reports.get(`${id}|${v}`)?.pass === true && existsSync(`${OUT}/${id}--${v}.mp3`);

  let improved = 0;
  let tried = 0;
  for (const sentence of all) {
    if (only.length && !only.includes(sentence.id)) continue;
    const variants = variantsToMake(sentence);
    const complete = variants.every((v) => have(sentence.id, v));
    const viaPsola = variants.every((v) => reports.get(`${sentence.id}|${v}`)?.kept === "psola");
    if (!doAll && !only.length && (complete || viaPsola)) continue;
    tried++;

    // the voice the sentence already uses (one sentence = one voice), else the female voice
    const voice: "f" | "m" = variants.map((v) => reports.get(`${sentence.id}|${v}`)).find((r) => r?.pass && r.voice)?.voice ?? "f";
    console.log(`${sentence.id} [${voice}] "${sentence.text}"`);
    let base: { samples: Float32Array; sampleRate: number; words: Awaited<ReturnType<typeof synthesize>>["words"] };
    try {
      const tts = await synthesize(buildSsml(sentence, VOICES[voice], { shape: "none", punctuation: "original", breakMs: 250 }), key, region);
      const dec = await decodeMp3(tts.mp3);
      base = { samples: dec.samples, sampleRate: dec.sampleRate, words: tts.words };
    } catch (e) {
      console.log(`  could not get a reading: ${String((e as Error).message).slice(0, 100)}`);
      continue;
    }
    const f0 = trackPitch(base.samples, base.sampleRate);
    const voiced = f0.filter((f) => f.hz !== null).map((f) => f.hz as number);
    if (voiced.length < 30) {
      console.log("  the reading has too little voiced speech to re-pitch");
      continue;
    }
    const baseline = median(voiced);

    const made = new Map<ClipVariant, { pass: boolean; grade?: "strict" | "ending"; bytes?: Uint8Array; why: string[] }>();
    for (const variant of variants) {
      const vs = variantSentence(sentence, variant);
      if (!vs) continue;
      const plan = syllablePlan(vs, base.words, f0);
      // the course's levels are 4 semitones apart; when that is not clear enough for the checker, a teaching clip may exaggerate a little
      let pass = false;
      let grade: "strict" | "ending" = "strict";
      let why: string[] = [];
      let out: Float32Array = new Float32Array(0);
      let loose: Float32Array | null = null; // the first result whose ending is right, in case nothing passes the full gate
      for (const spread of SPREADS) {
        out = repitch(base.samples, base.sampleRate, f0, targetLine(plan, baseline, spread));
        // what follows the last voiced syllable is a release or a breath the pitch tracker can mistake for a high note: fade it out
        if (plan.length) {
          const from = Math.round((plan[plan.length - 1].t1 + 0.04) * base.sampleRate);
          const len = Math.round(0.03 * base.sampleRate);
          for (let n = from; n < out.length; n++) out[n] *= Math.max(0, 1 - (n - from) / len);
        }
        if (variant === "flat") {
          const g = flatGate(out, base.sampleRate);
          pass = g.pass;
          why = g.reasons;
        } else {
          const a = analyzeReference(out, base.sampleRate, vs, base.words);
          const gate = gateReference(a.result);
          pass = gate.pass && a.aligned;
          why = a.aligned || !gate.pass ? gate.reasons : ["peak position not checked (words not aligned)"];
          if (!pass && !loose && endingGate(a.result)) loose = out;
        }
        if (pass || variant === "flat") break;
      }
      if (!pass && loose) {
        pass = true;
        grade = "ending";
        out = loose;
        why = ["ending right, peak not placed perfectly: " + why.join("; ").slice(0, 90)];
      }
      made.set(variant, { pass, grade, bytes: pass ? mp3(out, base.sampleRate) : undefined, why });
      console.log(`  ${variant}: ${pass ? (grade === "ending" ? "pass (ending only)" : "pass") : "FAILED " + why.join("; ").slice(0, 110)}`);
    }

    const newScore = setScore((v) => made.get(v)?.pass === true);
    const oldScore = setScore((v) => have(sentence.id, v));
    const newCount = variants.filter((v) => made.get(v)?.pass).length;
    const oldCount = variants.filter((v) => have(sentence.id, v)).length;
    if (newScore > oldScore || (newScore === oldScore && newCount > oldCount)) {
      improved++;
      console.log(`  -> re-pitched set wins (${newScore} vs ${oldScore}): replacing this sentence's clips`);
      for (const v of variants) {
        const f = `${OUT}/${sentence.id}--${v}.mp3`;
        if (existsSync(f)) rmSync(f);
        const m = made.get(v);
        if (m?.pass && m.bytes) writeFileSync(f, m.bytes);
        reports.set(`${sentence.id}|${v}`, { id: sentence.id, variant: v, voice, pass: !!m?.pass, kept: m?.pass ? "psola" : null, grade: m?.pass ? m.grade : undefined, why: m?.why ?? [], signature: "psola" });
      }
      writeFileSync(reportFile, JSON.stringify({ clips: [...reports.values()] }, null, 2) + "\n");
    } else console.log(`  -> keeping the existing clips (${oldScore} vs ${newScore})`);
  }

  // summary in report.json, as make-variants.ts writes it
  const ordered = [...reports.values()];
  const REAL: ClipVariant[] = ["falling", "rising", "flat", "finished"];
  const byVariant = Object.fromEntries(REAL.map((v) => [v, `${ordered.filter((r) => r.variant === v && r.pass).length}/${ordered.filter((r) => r.variant === v).length}`]));
  const failed = ordered.filter((r) => !r.pass).map((r) => ({ id: r.id, variant: r.variant, why: r.why.join("; ").slice(0, 200) }));
  writeFileSync(
    reportFile,
    JSON.stringify(
      {
        _comment:
          "Made by tools/make-variants.ts and tools/make-variants-psola.ts. needsHumanRecording: clips neither method could make; record them as public/audio/variants/<id>--<variant>.mp3 and run `npm run build:variants -- --manifest`. Exercises that need a missing clip play the synthetic voice instead.",
        passed: byVariant,
        endingOnly: ordered.filter((r) => r.pass && r.grade === "ending").map((r) => `${r.id}--${r.variant}`),
        needsHumanRecording: failed,
        clips: ordered,
      },
      null,
      2,
    ) + "\n",
  );
  writeManifest();
  console.log(`${ordered.filter((r) => r.pass && r.grade === "ending").length} clips are ending-only grade (listen to those first).`);
  console.log(`Tried ${tried} sentences, ${improved} improved. Passed per tune:`, byVariant, `| ${failed.length} clips still missing`);
  console.log(`Azure: ${usage.requests} requests, ${usage.charsBilled} characters billed this run (${usage.charsCached} more from the cache).`);
}

await main();

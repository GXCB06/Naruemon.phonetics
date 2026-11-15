// Practice clips in NATURAL voices: no pitch markup, no re-pitching. Each tune is asked for only with punctuation
// ("." for a fall, "?" for a rise, "," for a part that continues), and the voice reads it the way it naturally would.
// Forcing a tune (tools/make-variants.ts pitch markup, tools/make-variants-psola.ts re-pitching) made clips that sound
// processed; these do not.
//
//   npm run build:variants:natural                 # every sentence, replacing all practice clips
//   npm run build:variants:natural -- <id> <id>    # only these sentences (their clips are replaced)
//
// For each sentence it tries the voices below in order and keeps the first one that gives the most tunes; one sentence is
// always one voice. A clip is kept when every thought group ENDS the way the tune says (the rule engine's ending check)
// and the voice moves enough (range). The peak may not sit exactly on the textbook word: these clips are for hearing
// "does it end low or high?", not as the model for peak placement. A natural voice never reads a sentence flat, so no
// "flat" clips are made: exercises that need one play the melody instead.
// Needs AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local (cached on disk, so reruns are free).

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SENTENCES } from "../src/lib/intonation/lessons.ts";
import type { AnalysisResult, Sentence } from "../src/lib/intonation/types.ts";
import type { ClipVariant } from "../src/lib/learn/exercises.ts";
import { analyzeReference } from "../src/lib/synth/referenceGate.ts";
import { buildSsml } from "../src/lib/synth/ssml.ts";
import { variantSentence, variantsToMake } from "../src/lib/synth/variants.ts";
import { decodeMp3, loadAzureEnv, synthesize, usage } from "./tts-azure.ts";

const OUT = "public/audio/variants";
const UNITS = "content/units";
/** Best first (from a test of 14 sentences: how often each voice's natural reading ended the right way). */
const VOICES = ["Nancy", "Sara", "Jenny", "Aria", "Jason", "Ava", "Andrew", "Brian", "Guy", "Tony", "Emma", "Davis"].map((v) => `en-US-${v}Neural`);

function lessonSentences(): Sentence[] {
  const out: Sentence[] = [];
  for (const unit of readdirSync(UNITS).sort())
    for (const f of readdirSync(join(UNITS, unit)).filter((x) => x.endsWith(".json")).sort())
      out.push(...(JSON.parse(readFileSync(join(UNITS, unit, f), "utf8")) as { sentences: Sentence[] }).sentences);
  const seen = new Set(out.map((s) => s.id));
  return [...out, ...SENTENCES.filter((s) => !seen.has(s.id))];
}

/** Every thought group ends the way its pattern says, and the voice has a real range. */
function endsRight(result: AnalysisResult | null): { ok: boolean; why: string[] } {
  if (!result) return { ok: false, why: ["no pitch found"] };
  const why: string[] = [];
  result.groups.forEach((g, i) => {
    for (const c of g.checks) {
      if ((c.id === "ending" && c.status !== "pass") || (c.id === "range" && c.status === "fail")) why.push(`group ${i + 1} (${g.pattern}) ${c.id}: ${c.status} (${c.message.en})`);
    }
  });
  return { ok: why.length === 0, why };
}

/** Same scale as the other clip tools: the falling+rising pair counts most. */
const score = (ok: (v: ClipVariant) => boolean) => (ok("falling") && ok("rising") ? 100 : 0) + (ok("falling") ? 10 : 0) + (ok("rising") ? 10 : 0) + (ok("finished") ? 3 : 0);

async function main() {
  const { key, region } = loadAzureEnv();
  mkdirSync(OUT, { recursive: true });
  const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const all = lessonSentences().filter((s) => !only.length || only.includes(s.id));
  const reportFile = `${OUT}/report.json`;
  type Clip = { id: string; variant: ClipVariant; voice: string; pass: boolean; kept: "natural" | null; why: string[] };
  const old = existsSync(reportFile) ? ((JSON.parse(readFileSync(reportFile, "utf8")) as { clips?: Clip[] }).clips ?? []) : [];
  const reports = new Map<string, Clip>(only.length ? old.map((c) => [`${c.id}|${c.variant}`, c]) : []);
  if (!only.length) for (const f of readdirSync(OUT).filter((x) => x.endsWith(".mp3"))) rmSync(join(OUT, f)); // all processed clips go

  for (const s of all) {
    const wanted = variantsToMake(s).filter((v) => v !== "flat");
    let best: { voice: string; made: Map<ClipVariant, { mp3?: Uint8Array; why: string[] }>; score: number; count: number } | null = null;
    for (const voice of VOICES) {
      const made = new Map<ClipVariant, { mp3?: Uint8Array; why: string[] }>();
      for (const v of wanted) {
        const vs = variantSentence(s, v);
        if (!vs) continue;
        try {
          const tts = await synthesize(buildSsml(vs, voice, { shape: "none", punctuation: "pattern" }), key, region);
          const { samples, sampleRate } = await decodeMp3(tts.mp3);
          const r = endsRight(analyzeReference(samples, sampleRate, vs, tts.words).result);
          made.set(v, { mp3: r.ok ? tts.mp3 : undefined, why: r.why });
        } catch (e) {
          made.set(v, { why: [String((e as Error).message).slice(0, 120)] });
        }
      }
      const sc = score((v) => !!made.get(v)?.mp3);
      const count = wanted.filter((v) => made.get(v)?.mp3).length;
      if (!best || sc > best.score || (sc === best.score && count > best.count)) best = { voice, made, score: sc, count };
      if (count === wanted.length) break; // every tune this sentence needs, in one natural voice
    }
    if (!best) continue;
    for (const v of variantsToMake(s)) {
      const f = `${OUT}/${s.id}--${v}.mp3`;
      if (existsSync(f)) rmSync(f);
      const m = best.made.get(v);
      if (m?.mp3) writeFileSync(f, m.mp3);
      reports.set(`${s.id}|${v}`, {
        id: s.id,
        variant: v,
        voice: best.voice,
        pass: !!m?.mp3,
        kept: m?.mp3 ? "natural" : null,
        why: v === "flat" ? ["natural voices do not read a sentence flat: the melody plays instead"] : (m?.why ?? []),
      });
    }
    console.log(`${s.id}: ${best.voice.replace(/^en-US-|Neural$/g, "")} ${wanted.map((v) => `${v}:${best!.made.get(v)?.mp3 ? "yes" : "no"}`).join(" ")}`);
  }

  const clips: Record<string, ClipVariant[]> = {};
  for (const f of readdirSync(OUT).filter((x) => x.endsWith(".mp3")).sort()) {
    const m = /^(.+)--(falling|rising|flat|finished)\.mp3$/.exec(f);
    if (m) (clips[m[1]] ??= []).push(m[2] as ClipVariant);
  }
  writeFileSync(
    `${OUT}/manifest.json`,
    JSON.stringify(
      {
        _comment:
          "Real-voice practice clips per sentence id and tune: natural Azure voices, tune asked for with punctuation only (tools/make-variants-natural.ts), or recorded by hand and added with npm run build:variants -- --manifest. The app uses them only when every clip an exercise needs exists.",
        clips,
      },
      null,
      2,
    ) + "\n",
  );
  const list = [...reports.values()];
  const pairs = Object.values(clips).filter((v) => v.includes("falling") && v.includes("rising")).length;
  writeFileSync(
    reportFile,
    JSON.stringify(
      {
        _comment: "Made by tools/make-variants-natural.ts. needsHumanRecording: tunes no natural voice produced; record them as public/audio/variants/<id>--<tune>.mp3.",
        needsHumanRecording: list.filter((c) => !c.pass).map((c) => ({ id: c.id, variant: c.variant, why: c.why.join("; ").slice(0, 200) })),
        clips: list,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`${Object.values(clips).flat().length} natural clips; ${pairs}/${all.length} sentences have a falling+rising pair`);
  console.log(`Azure: ${usage.requests} requests, ${usage.charsBilled} characters billed (${usage.charsCached} from the cache)`);
}

await main();

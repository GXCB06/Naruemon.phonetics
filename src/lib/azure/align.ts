// Real syllable alignment for voice (task B3). Pure: no DOM, no React, no SDK.
//
// Phase 0a stretched each thought group's voiced segment linearly onto the target span, so the engine could not tell
// WHICH syllable carried the rise and skipped `peakPlacement` for voice. With Azure's word and syllable timestamps we
// know when every syllable was said, so we can warp real seconds onto our layout axis piece by piece:
//
//   learner pitch (seconds)  --warp-->  layout axis 0..1 (one slot per syllable)  -->  analyze(..., timingKnown: true)
//
// Steps: match Azure words to our words by text (monotone LCS, so a skipped or inserted word does not shift everything),
// give each of our syllable slots a time interval (Azure's own syllable when the counts agree, otherwise the word's
// interval split in proportion), sample the pitch contour through the inverse of that warp on a uniform grid, and run
// the unchanged engine. Thought groups whose words cannot all be matched fall back to the Phase 0a stretch, and their
// `peakPlacement` is reported as skipped. A `warnings` list says what happened.
//
// engine.ts is not edited. Two things it cannot do for us are wrapped here (see the report that came with this change):
//  - its `break` check only runs in the non-timed path, so we add the sentence-level `break` checks ourselves, from
//    Azure's inter-word gaps (and its own "unexpected break" flags), and
//  - its overall score is computed inside `analyze`, so `rescore` repeats that formula (guarded by a test) to include them.

import type { LevelContour } from "../audio/pitch.ts";
import type { VoiceAnalysis } from "../audio/analyzeVoice.ts";
import { GRID_STEP, layoutSentence, mean } from "../intonation/contour.ts";
import { analyze, splitByPauses, SCORE_CAP, THRESHOLDS } from "../intonation/engine.ts";
import type {
  AnalysisResult,
  Check,
  CheckStatus,
  Contour,
  ContourPoint,
  GroupResult,
  Layout,
  Sentence,
  SyllableSlot,
} from "../intonation/types.ts";
import type { AzureAssessment, AzureWord } from "./parse.ts";

export interface Bilingual {
  en: string;
  th: string;
}

export type AlignWarningCode =
  | "no-match" // none of our words could be matched: the whole take uses the Phase 0a stretch
  | "unmatched-word" // a word of the sentence has no counterpart in Azure's result
  | "omitted-word" // Azure marked the word as skipped
  | "no-timing" // Azure's timestamps for the word are unusable
  | "syllable-count" // Azure split the word into a different number of syllables than our data
  | "fallback-group" // a thought group uses the Phase 0a stretch; its peak position was not checked
  | "unmeasured-break"; // the pause between two thought groups could not be measured

export interface AlignWarning {
  code: AlignWarningCode;
  message: Bilingual;
  /** Index into the sentence's words in reading order (all thought groups), when the warning is about one word. */
  wordIndex?: number;
  groupIndex?: number;
}

export type AlignMode =
  /** Every thought group was aligned with Azure's timestamps. */
  | "aligned"
  /** Some groups were aligned, the rest use the Phase 0a stretch. */
  | "partial"
  /** Nothing could be matched; this is the Phase 0a result. */
  | "stretched";

export interface AlignedAnalysis extends AnalysisResult {
  mode: AlignMode;
  warnings: AlignWarning[];
  /** Per thought group: true when it was aligned with Azure's timestamps. */
  alignedGroups: boolean[];
}

// ---------------------------------------------------------------------------
// Word matching
// ---------------------------------------------------------------------------

/** Lower-case, drop punctuation and apostrophes, so "Isn't," "isn’t" and "isnt" all match. */
export function matchKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface SentenceWord {
  /** Position in reading order across all thought groups. */
  index: number;
  groupIndex: number;
  wordIndex: number;
  text: string;
  key: string;
  /** Indices into layout.slots. */
  slotIndices: number[];
}

export function sentenceWords(sentence: Sentence, layout: Layout): SentenceWord[] {
  const out: SentenceWord[] = [];
  sentence.groups.forEach((g, gi) =>
    g.words.forEach((w, wi) =>
      out.push({
        index: out.length,
        groupIndex: gi,
        wordIndex: wi,
        text: w.text,
        key: matchKey(w.text),
        slotIndices: layout.slots.flatMap((s, i) => (s.groupIndex === gi && s.wordIndex === wi ? [i] : [])),
      }),
    ),
  );
  return out;
}

/**
 * Monotone matching of our words to Azure's words by text (longest common subsequence). Azure's "Insertion" words are
 * extra words the learner said, which are not in the reference text, so they are ignored. Returns, per word of ours, the
 * index into `assessment.words` or -1.
 */
export function matchWords(ours: SentenceWord[], assessment: AzureAssessment): number[] {
  const cand = assessment.words.map((w, i) => ({ i, key: matchKey(w.word), insertion: w.errorType === "Insertion" })).filter((c) => !c.insertion);
  const n = ours.length;
  const m = cand.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = ours[i].key !== "" && ours[i].key === cand[j].key ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const result = Array<number>(n).fill(-1);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (ours[i].key !== "" && ours[i].key === cand[j].key && dp[i][j] === 1 + dp[i + 1][j + 1]) {
      result[i] = cand[j].i;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Syllable intervals and the time warp
// ---------------------------------------------------------------------------

/** One of our syllable slots with the seconds it was said in, and where it sits on the layout axis. */
export interface Anchor {
  slotIndex: number;
  groupIndex: number;
  startSec: number;
  endSec: number;
  axisStart: number;
  axisEnd: number;
}

/** Relative length of a syllable, used to split a word's time when Azure's syllables don't line up with ours. */
function syllableWeight(s: SyllableSlot): number {
  const phones = Math.max(1, [...s.syllable.ipa].length);
  return phones * (s.syllable.stressed ? 1.35 : 1); // stressed syllables are longer
}

/** Split [a, b] in proportion to `weights`. */
function splitProportionally(a: number, b: number, weights: number[]): [number, number][] {
  const total = weights.reduce((x, y) => x + y, 0);
  let acc = 0;
  return weights.map((w) => {
    const from = a + ((b - a) * acc) / total;
    acc += w;
    return [from, a + ((b - a) * acc) / total];
  });
}

/**
 * Time interval (seconds) of each syllable of one of our words. When Azure has the same number of syllables, its own
 * boundaries are used; otherwise the word's interval is distributed in proportion to the syllables' length.
 */
export function syllableIntervals(slots: SyllableSlot[], az: AzureWord): { intervals: [number, number][]; countMismatch: boolean } {
  const wStart = az.offsetSec;
  const wEnd = az.offsetSec + az.durationSec;
  const n = slots.length;
  if (n === 1) return { intervals: [[wStart, wEnd]], countMismatch: az.syllables.length > 1 };
  const same =
    az.syllables.length === n &&
    az.syllables.every((s, i) => s.durationSec > 0 && (i === 0 || s.offsetSec >= az.syllables[i - 1].offsetSec));
  if (same) {
    return { intervals: az.syllables.map((s): [number, number] => [s.offsetSec, s.offsetSec + s.durationSec]), countMismatch: false };
  }
  return { intervals: splitProportionally(wStart, wEnd, slots.map(syllableWeight)), countMismatch: az.syllables.length !== n };
}

/** Seconds → layout axis through the anchors (piecewise linear). Null outside the spoken range. */
export function warpToAxis(anchors: Anchor[], sec: number): number | null {
  if (anchors.length === 0 || sec < anchors[0].startSec || sec > anchors[anchors.length - 1].endSec) return null;
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    if (sec <= a.endSec) {
      if (sec < a.startSec) {
        // in the gap before this anchor
        const prev = anchors[i - 1];
        if (prev.groupIndex === a.groupIndex) return a.axisStart; // gaps inside a thought group collapse
        const f = (sec - prev.endSec) / (a.startSec - prev.endSec); // the pause between groups maps onto the layout gap
        return prev.axisEnd + f * (a.axisStart - prev.axisEnd);
      }
      const f = a.endSec > a.startSec ? (sec - a.startSec) / (a.endSec - a.startSec) : 0;
      return a.axisStart + f * (a.axisEnd - a.axisStart);
    }
  }
  return null;
}

/** Layout axis → seconds inside one anchor's slot (the inverse of warpToAxis within a syllable). */
function axisToSeconds(a: Anchor, t: number): number {
  const f = a.axisEnd > a.axisStart ? (t - a.axisStart) / (a.axisEnd - a.axisStart) : 0;
  return a.startSec + f * (a.endSec - a.startSec);
}

// ---------------------------------------------------------------------------
// Pitch frames in real seconds
// ---------------------------------------------------------------------------

export interface TimedFrame {
  time: number;
  v: number | null;
}

/** `toLevelContour` normalises time to the voiced span; this puts the frames back at real seconds of the take. */
export function levelFramesSec(level: LevelContour): TimedFrame[] {
  return level.contour.map((p) => ({ time: level.startSec + p.t * level.durationSec, v: p.v }));
}

function levelAt(frames: TimedFrame[], sec: number): number | null {
  if (frames.length === 0) return null;
  let lo = 0;
  let hi = frames.length - 1;
  if (sec < frames[0].time || sec > frames[hi].time) return null;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].time <= sec) lo = mid;
    else hi = mid;
  }
  const a = frames[lo];
  const b = frames[hi];
  if (a.v !== null && b.v !== null) {
    const f = b.time > a.time ? (sec - a.time) / (b.time - a.time) : 0;
    return a.v + f * (b.v - a.v);
  }
  const nearest = sec - a.time <= b.time - sec ? a : b;
  const gap = b.time - a.time;
  return nearest.v !== null && Math.abs(sec - nearest.time) <= gap / 2 ? nearest.v : null;
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

/** Sample one aligned thought group on a uniform grid of the layout axis, through the inverse warp. */
function sampleGroup(span: { start: number; end: number }, anchors: Anchor[], frames: TimedFrame[]): ContourPoint[] {
  const n = Math.max(1, Math.ceil((span.end - span.start) / GRID_STEP));
  const out: ContourPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i === n ? span.end : span.start + ((span.end - span.start) * i) / n;
    const a = anchors.find((x) => t >= x.axisStart && t < x.axisEnd) ?? anchors[anchors.length - 1];
    out.push({ t: round6(t), v: levelAt(frames, axisToSeconds(a, t)) });
  }
  return out;
}

/** The Phase 0a re-timing: stretch a segment's voiced core linearly onto a span (same as engine.ts). */
function stretch(seg: Contour, span: { start: number; end: number }): Contour {
  const first = seg.findIndex((p) => p.v !== null);
  let last = -1;
  for (let i = seg.length - 1; i >= 0; i--) {
    if (seg[i].v !== null) {
      last = i;
      break;
    }
  }
  if (first < 0) return [];
  const core = seg.slice(first, last + 1);
  const a = core[0].t;
  const b = core[core.length - 1].t;
  const k = b > a ? (span.end - span.start) / (b - a) : 0;
  return core.map((p) => ({ t: span.start + (p.t - a) * k, v: p.v }));
}

// ---------------------------------------------------------------------------
// Alignment
// ---------------------------------------------------------------------------

export interface WordTiming {
  startSec: number;
  endSec: number;
  azureIndex: number;
}

export interface Alignment {
  words: SentenceWord[];
  /** Per sentence word: its Azure timing, or null when it could not be matched / had no usable timing. */
  timings: (WordTiming | null)[];
  /** Per thought group: the syllable anchors when every word was matched, else null. */
  groupAnchors: (Anchor[] | null)[];
  warnings: AlignWarning[];
}

function warn(code: AlignWarningCode, en: string, th: string, extra: Partial<AlignWarning> = {}): AlignWarning {
  return { code, message: { en, th }, ...extra };
}

/** Match Azure's words and syllables to our layout. Pure data work; no pitch involved. */
export function alignSentence(sentence: Sentence, layout: Layout, assessment: AzureAssessment): Alignment {
  const words = sentenceWords(sentence, layout);
  const matched = matchWords(words, assessment);
  const warnings: AlignWarning[] = [];
  const timings: (WordTiming | null)[] = [];
  const wordAnchors: (Anchor[] | null)[] = [];

  words.forEach((sw, i) => {
    const ai = matched[i];
    const shown = sw.text.replace(/[^\p{L}'’-]/gu, "");
    if (ai < 0) {
      warnings.push(
        warn("unmatched-word", `Couldn't find “${shown}” in Azure's result.`, `ไม่พบคำว่า “${shown}” ในผลของ Azure`, { wordIndex: i }),
      );
      timings.push(null);
      wordAnchors.push(null);
      return;
    }
    const az = assessment.words[ai];
    if (az.errorType === "Omission") {
      warnings.push(warn("omitted-word", `Azure heard no “${shown}”.`, `Azure ไม่ได้ยินคำว่า “${shown}”`, { wordIndex: i }));
      timings.push(null);
      wordAnchors.push(null);
      return;
    }
    if (!(az.durationSec > 0)) {
      warnings.push(warn("no-timing", `Azure gave no timing for “${shown}”.`, `Azure ไม่ได้ให้เวลาของคำว่า “${shown}”`, { wordIndex: i }));
      timings.push(null);
      wordAnchors.push(null);
      return;
    }
    const slots = sw.slotIndices.map((k) => layout.slots[k]);
    const { intervals, countMismatch } = syllableIntervals(slots, az);
    if (countMismatch) {
      warnings.push(
        warn(
          "syllable-count",
          `Azure split “${shown}” into ${az.syllables.length} syllable(s), we have ${slots.length}; the time was shared in proportion.`,
          `Azure แบ่งคำว่า “${shown}” เป็น ${az.syllables.length} พยางค์ แต่ของเรามี ${slots.length} จึงแบ่งเวลาตามสัดส่วน`,
          { wordIndex: i },
        ),
      );
    }
    timings.push({ startSec: az.offsetSec, endSec: az.offsetSec + az.durationSec, azureIndex: ai });
    wordAnchors.push(
      intervals.map(([startSec, endSec], k) => ({
        slotIndex: sw.slotIndices[k],
        groupIndex: sw.groupIndex,
        startSec,
        endSec,
        axisStart: slots[k].start,
        axisEnd: slots[k].end,
      })),
    );
  });

  // A group is aligned only when every word has anchors; make each group's intervals strictly ordered.
  const groupAnchors: (Anchor[] | null)[] = sentence.groups.map((_, gi) => {
    const own = words.filter((w) => w.groupIndex === gi);
    if (own.some((w) => wordAnchors[w.index] === null)) return null;
    const anchors = own.flatMap((w) => wordAnchors[w.index] as Anchor[]);
    let prevEnd = -Infinity;
    for (const a of anchors) {
      a.startSec = Math.max(a.startSec, prevEnd);
      if (a.endSec < a.startSec + 0.005) a.endSec = a.startSec + 0.005;
      prevEnd = a.endSec;
    }
    return anchors;
  });

  return { words, timings, groupAnchors, warnings };
}

// ---------------------------------------------------------------------------
// Pauses between thought groups (replaces the pause heuristic when timing is known)
// ---------------------------------------------------------------------------

function check(id: Check["id"], status: CheckStatus, en: string, th: string): Check {
  return { id, status, message: { en, th } };
}

function breakChecks(sentence: Sentence, aln: Alignment, assessment: AzureAssessment): { checks: Check[]; warnings: AlignWarning[] } {
  const checks: Check[] = [];
  const warnings: AlignWarning[] = [];
  const { words, timings } = aln;
  for (let g = 0; g < sentence.groups.length - 1; g++) {
    const last = [...words].reverse().find((w) => w.groupIndex === g);
    const first = words.find((w) => w.groupIndex === g + 1);
    const a = last ? timings[last.index] : null;
    const b = first ? timings[first.index] : null;
    if (!a || !b) {
      warnings.push(
        warn(
          "unmeasured-break",
          `Couldn't measure the pause between part ${g + 1} and part ${g + 2}.`,
          `วัดช่วงหยุดระหว่างส่วนที่ ${g + 1} กับส่วนที่ ${g + 2} ไม่ได้`,
          { groupIndex: g },
        ),
      );
      continue;
    }
    const gap = b.startSec - a.endSec;
    const ms = Math.max(0, Math.round(gap * 1000));
    checks.push(
      gap >= THRESHOLDS.minBreakSec
        ? check("break", "pass", `Good pause between the thought groups (${ms} ms).`, `เว้นจังหวะระหว่างกลุ่มคำได้ดี (${ms} มิลลิวินาที)`)
        : check(
            "break",
            "warn",
            `Pause briefly at the comma so each thought group has its own tune (your pause was ${ms} ms).`,
            `หยุดเล็กน้อยตรงเครื่องหมายจุลภาค ให้แต่ละกลุ่มคำมีทำนองของตัวเอง (คุณหยุด ${ms} มิลลิวินาที)`,
          ),
    );
  }

  // Azure's own "unexpected break" flag inside a thought group: one tune should not be cut in two.
  const lastOfGroup = new Set(sentence.groups.map((_, g) => [...words].reverse().find((w) => w.groupIndex === g)?.index));
  for (const brk of assessment.breaks) {
    if (brk.type !== "unexpected") continue;
    const sw = words.find((w) => timings[w.index]?.azureIndex === brk.wordIndex);
    if (!sw || lastOfGroup.has(sw.index)) continue;
    const shown = sw.text.replace(/[^\p{L}'’-]/gu, "");
    checks.push(
      check(
        "break",
        "warn",
        `You paused after “${shown}”, in the middle of a thought group. Keep it together so it has one tune.`,
        `คุณหยุดหลังคำว่า “${shown}” ตรงกลางกลุ่มคำ ให้พูดต่อเนื่องเพื่อให้มีทำนองเดียว`,
      ),
    );
  }
  return { checks, warnings };
}

// ---------------------------------------------------------------------------
// Scoring (repeats engine.ts's formula so the break checks and skipped peaks count; a test keeps them in step)
// ---------------------------------------------------------------------------

export function rescore(groups: GroupResult[], sentenceChecks: Check[]): number {
  const all = [...groups.flatMap((g) => g.checks), ...sentenceChecks].filter((c) => c.status !== "skip");
  const weight = (c: Check) => (c.id === "ending" ? 2 : 1);
  const value = (c: Check) => (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0);
  const totalW = all.reduce((n, c) => n + weight(c), 0);
  const checkScore = totalW ? all.reduce((n, c) => n + weight(c) * value(c), 0) / totalW : 0;
  const shape = mean(groups.map((g) => g.shapeScore)) / 100;
  let overall = Math.round(100 * (0.6 * checkScore + 0.4 * shape));
  if (all.some((c) => c.id === "ending" && c.status === "fail")) overall = Math.min(overall, SCORE_CAP.wrongEnding);
  if (all.some((c) => c.id === "range" && c.status === "fail")) overall = Math.min(overall, SCORE_CAP.flat);
  return overall;
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/**
 * Re-analyse a voice take with Azure's timestamps. `level` must come from the same audio that was sent to Azure
 * (`analyzeVoice` trims first and sends that trimmed take, so the clocks agree).
 */
export function analyzeAligned(level: LevelContour, assessment: AzureAssessment, sentence: Sentence): AlignedAnalysis {
  const layout = layoutSentence(sentence);
  const aln = alignSentence(sentence, layout, assessment);
  const warnings = [...aln.warnings];
  const G = sentence.groups.length;
  const alignedGroups = aln.groupAnchors.map((a) => a !== null);

  if (!alignedGroups.some(Boolean)) {
    warnings.push(
      warn(
        "no-match",
        "Couldn't line Azure's words up with the sentence, so the time is stretched per thought group and the peak position isn't checked.",
        "จับคู่คำของ Azure กับประโยคไม่ได้ จึงยืดเวลาตามกลุ่มคำ และยังไม่ตรวจตำแหน่งจุดสูงสุด",
      ),
    );
    const plain = analyze(sentence, level.contour, { modality: "speak", timingKnown: false, durationSec: level.durationSec });
    return { ...plain, mode: "stretched", warnings, alignedGroups };
  }

  const frames = levelFramesSec(level);
  const old = alignedGroups.every(Boolean) ? null : splitByPauses(level.contour, G, level.durationSec).segments;
  const learner: Contour = sentence.groups.flatMap((_, gi) => {
    const anchors = aln.groupAnchors[gi];
    if (anchors) return sampleGroup(layout.groupSpans[gi], anchors, frames);
    warnings.push(
      warn(
        "fallback-group",
        `Part ${gi + 1} is stretched to fit (some words weren't matched), so its peak position wasn't checked.`,
        `ส่วนที่ ${gi + 1} ถูกยืดให้พอดี (จับคู่บางคำไม่ได้) จึงยังไม่ตรวจตำแหน่งจุดสูงสุด`,
        { groupIndex: gi },
      ),
    );
    return stretch(old?.[gi] ?? [], layout.groupSpans[gi]);
  });

  const raw = analyze(sentence, learner, { modality: "speak", timingKnown: true });

  const groups: GroupResult[] = raw.groups.map((g) =>
    alignedGroups[g.groupIndex]
      ? g
      : {
          ...g,
          checks: g.checks.map((c) =>
            c.id === "peakPlacement"
              ? check(
                  "peakPlacement",
                  "skip",
                  "Couldn't line this part up with Azure's word timing, so the peak position wasn't checked.",
                  "จับเวลาคำในส่วนนี้กับ Azure ไม่ได้ จึงยังไม่ได้ตรวจตำแหน่งจุดสูงสุด",
                )
              : c,
          ),
        },
  );

  const breaks = breakChecks(sentence, aln, assessment);
  warnings.push(...breaks.warnings);
  const sentenceChecks = [...raw.sentenceChecks, ...breaks.checks];

  return {
    ...raw,
    groups,
    sentenceChecks,
    overall: rescore(groups, sentenceChecks),
    mode: alignedGroups.every(Boolean) ? "aligned" : "partial",
    warnings,
    alignedGroups,
  };
}

/**
 * Re-analyse a recorded take (`analyzeVoice`'s output) with Azure's word and syllable timestamps, so `peakPlacement`
 * runs for voice. Returns null when no pitch was found in the take.
 */
export function analyzeVoiceAligned(voice: VoiceAnalysis, assessment: AzureAssessment, sentence: Sentence): AlignedAnalysis | null {
  if (!voice.level) return null;
  return analyzeAligned(voice.level, assessment, sentence);
}

// The pitch line a practice clip should have: a sentence's levels (1 low … 4 extra high, 2 = the speaker's normal voice) laid on
// the time axis of one natural reading, using the word timings the speech service reports. Pure.

import type { PitchFrame } from "../audio/pitch.ts";
import { SEMITONES_PER_LEVEL } from "../intonation/contour.ts";
import type { Sentence } from "../intonation/types.ts";
import { normalizeWord } from "../ipa/words.ts";
import type { TtsWord } from "./referenceGate.ts";

export interface SyllablePlan {
  /** Seconds from the start of the clip. */
  t0: number;
  t1: number;
  /** One level (held) or two (a glide inside the syllable). */
  levels: number[];
}

/** Our sentence's words in reading order, with their syllables. */
function ourWords(sentence: Sentence) {
  return sentence.groups.flatMap((g) => g.words);
}

const key = (text: string) => normalizeWord(text.replace(/’/g, "'"));

/** For each of our words, the index of the spoken word with the same spelling, in order (null when it was not spoken). */
function matchSpoken(ours: readonly string[], spoken: readonly TtsWord[]): (number | null)[] {
  const heard = spoken.map((w) => key(w.text));
  let from = 0;
  return ours.map((k) => {
    for (let j = from; j < heard.length; j++) {
      if (heard[j] === k) {
        from = j + 1;
        return j;
      }
    }
    return null;
  });
}

/**
 * The part of a spoken word that actually has a voice. A speech service reports a word's interval with its release and the pause
 * after it ("work" ends in a silent k), and a falling tune laid over that whole interval would fall after the voice has stopped.
 * With the pitch track, the word is cut to its first and last voiced frame; with fewer than 3 voiced frames it is left whole.
 */
function voicedExtent(offset: number, duration: number, voiced: readonly PitchFrame[]): [number, number] {
  const pitched = voiced.filter((f) => f.hz !== null && f.time >= offset - 0.01 && f.time <= offset + duration);
  // a quiet detection (a release, a breath) is not the voice: keep frames at least 20% as loud as the loudest in the word
  const loudest = Math.max(0, ...pitched.map((f) => f.rms));
  const inside = pitched.filter((f) => f.rms >= 0.2 * loudest);
  // runs of voiced frames (gaps up to 35 ms bridged); a run shorter than 4 frames (40 ms) is a stray detection, not speech
  const runs: PitchFrame[][] = [];
  for (const f of inside) {
    const run = runs[runs.length - 1];
    if (run && f.time - run[run.length - 1].time <= 0.035) run.push(f);
    else runs.push([f]);
  }
  const real = runs.filter((r) => r.length >= 4);
  if (real.length === 0) return [offset, offset + duration];
  const first = real[0][0];
  const last = real[real.length - 1][real[real.length - 1].length - 1];
  return [Math.max(offset, first.time - 0.005), Math.min(offset + duration, last.time + 0.01)];
}

/**
 * When each syllable of the sentence was said: a spoken word's voiced interval is shared between its syllables by their length
 * (letters, with the stressed one counting a little more). Words the speech service did not report are left out. Give the
 * pitch track as `voiced` to cut each word to its voiced part (recommended).
 */
export function syllablePlan(sentence: Sentence, spoken: readonly TtsWord[], voiced?: readonly PitchFrame[]): SyllablePlan[] {
  const words = ourWords(sentence);
  const match = matchSpoken(
    words.map((w) => key(w.text)),
    spoken,
  );
  const plan: SyllablePlan[] = [];
  words.forEach((w, i) => {
    const j = match[i];
    if (j === null) return;
    const word = spoken[j];
    if (!(word.durationSec > 0)) return;
    const [start, end] = voiced ? voicedExtent(word.offsetSec, word.durationSec, voiced) : [word.offsetSec, word.offsetSec + word.durationSec];
    const durationSec = end - start;
    if (!(durationSec > 0)) return;
    const weights = w.syllables.map((s) => Math.max(1, s.text.replace(/[^A-Za-z]/g, "").length) + (s.stressed ? 0.5 : 0));
    const total = weights.reduce((a, b) => a + b, 0);
    let at = start;
    w.syllables.forEach((s, k) => {
      const d = (weights[k] / total) * durationSec;
      plan.push({ t0: at, t1: at + d, levels: s.levels });
      at += d;
    });
  });
  return plan;
}

export interface Level {
  t: number;
  level: number;
}

/** Control points of the line: a held level is flat through the middle of its syllable; a glide runs from its start to 60% of the syllable, then holds its last level. */
export function levelPoints(plan: readonly SyllablePlan[]): Level[] {
  const pts: Level[] = [];
  for (const s of plan) {
    const d = s.t1 - s.t0;
    if (s.levels.length > 1) {
      // the glide takes the first 60% of the syllable and the last level is then held: a pitch still moving in every frame lowers
      // the pitch tracker's clarity (and a learner's ear) just where the ending should be clearest
      const last = s.levels[s.levels.length - 1];
      pts.push({ t: s.t0 + 0.12 * d, level: s.levels[0] }, { t: s.t0 + 0.6 * d, level: last }, { t: s.t1 - 0.1 * d, level: last });
    }
    else pts.push({ t: s.t0 + 0.2 * d, level: s.levels[0] }, { t: s.t1 - 0.2 * d, level: s.levels[0] });
  }
  return pts.sort((a, b) => a.t - b.t);
}

/** Pitch in Hz for a level, with level 2 at `baselineHz` and one level = `stPerLevel` semitones (4 in the course). */
export function levelToHz(level: number, baselineHz: number, stPerLevel = SEMITONES_PER_LEVEL): number {
  return baselineHz * 2 ** (((level - 2) * stPerLevel) / 12);
}

/**
 * The pitch wanted at time t: straight lines (in semitones) between the control points, the first and last level held before
 * and after. An empty plan gives the baseline everywhere.
 */
export function targetLine(plan: readonly SyllablePlan[], baselineHz: number, stPerLevel = SEMITONES_PER_LEVEL): (t: number) => number {
  const pts = levelPoints(plan);
  if (pts.length === 0) return () => baselineHz;
  return (t) => {
    if (t <= pts[0].t) return levelToHz(pts[0].level, baselineHz, stPerLevel);
    const last = pts[pts.length - 1];
    if (t >= last.t) return levelToHz(last.level, baselineHz, stPerLevel);
    let lo = 0;
    let hi = pts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].t <= t) lo = mid;
      else hi = mid;
    }
    const a = pts[lo];
    const b = pts[hi];
    const k = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
    return levelToHz(a.level + (b.level - a.level) * k, baselineHz, stPerLevel);
  };
}

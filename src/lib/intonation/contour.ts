import type { Contour, ContourPoint, Layout, Sentence, SyllableSlot } from "./types.ts";

/** Semitones above/below the speaker's baseline → continuous course level. 4 semitones ≈ one level. */
export const SEMITONES_PER_LEVEL = 4;
export function semitonesToLevel(st: number): number {
  return 2 + st / SEMITONES_PER_LEVEL;
}

/** Width of the pause drawn between thought groups, in syllable widths. */
const GROUP_GAP = 0.6;
/** Empty margin at each end, in syllable widths. */
const EDGE = 0.2;

/** Lay every syllable out on a shared 0..1 axis (equal width per syllable, a gap between thought groups). */
export function layoutSentence(sentence: Sentence): Layout {
  const total =
    sentence.groups.reduce((n, g) => n + g.words.reduce((m, w) => m + w.syllables.length, 0), 0) +
    GROUP_GAP * (sentence.groups.length - 1) +
    EDGE * 2;
  const unit = 1 / total;
  const slots: SyllableSlot[] = [];
  const groupSpans: { start: number; end: number }[] = [];
  let pos = EDGE;
  sentence.groups.forEach((g, gi) => {
    const groupStart = pos * unit;
    g.words.forEach((w, wi) => {
      w.syllables.forEach((s, si) => {
        slots.push({
          groupIndex: gi,
          wordIndex: wi,
          syllableIndex: si,
          start: pos * unit,
          end: (pos + 1) * unit,
          isNucleus: g.nucleus.word === wi && g.nucleus.syllable === si,
          syllable: s,
        });
        pos += 1;
      });
    });
    groupSpans.push({ start: groupStart, end: pos * unit });
    pos += GROUP_GAP;
  });
  return { slots, groupSpans };
}

/** Key points of the textbook line: one or two points per syllable. */
export function targetKeyPoints(layout: Layout): { t: number; v: number; groupIndex: number }[] {
  const pts: { t: number; v: number; groupIndex: number }[] = [];
  for (const slot of layout.slots) {
    const w = slot.end - slot.start;
    const lv = slot.syllable.levels;
    if (lv.length === 1) {
      pts.push({ t: slot.start + 0.25 * w, v: lv[0], groupIndex: slot.groupIndex });
      pts.push({ t: slot.start + 0.75 * w, v: lv[0], groupIndex: slot.groupIndex });
    } else {
      pts.push({ t: slot.start + 0.2 * w, v: lv[0], groupIndex: slot.groupIndex });
      pts.push({ t: slot.start + 0.85 * w, v: lv[lv.length - 1], groupIndex: slot.groupIndex });
    }
  }
  return pts;
}

export const GRID_STEP = 0.004;

/** Dense target contour on a uniform grid; null between thought groups and outside the sentence. */
export function targetContour(layout: Layout, step = GRID_STEP): Contour {
  const keys = targetKeyPoints(layout);
  const out: Contour = [];
  for (let t = 0; t <= 1 + 1e-9; t += step) {
    let v: number | null = null;
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i];
      const b = keys[i + 1];
      if (a.groupIndex !== b.groupIndex) continue;
      if (t >= a.t && t <= b.t) {
        const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
        v = a.v + f * (b.v - a.v);
        break;
      }
    }
    // Extend flat to the syllable edges so the group covers its whole span.
    if (v === null) {
      const slot = layout.slots.find((s) => t >= s.start && t <= s.end);
      if (slot) {
        const groupKeys = keys.filter((k) => k.groupIndex === slot.groupIndex);
        if (t < groupKeys[0].t) v = groupKeys[0].v;
        else if (t > groupKeys[groupKeys.length - 1].t) v = groupKeys[groupKeys.length - 1].v;
      }
    }
    out.push({ t: round(t), v });
  }
  return out;
}

/** Points of a contour that fall inside [start, end]. */
export function sliceContour(c: Contour, start: number, end: number): ContourPoint[] {
  return c.filter((p) => p.t >= start - 1e-9 && p.t <= end + 1e-9);
}

/** Fill interior nulls by linear interpolation; drop leading/trailing nulls. */
export function fillGaps(points: ContourPoint[]): { t: number; v: number }[] {
  const voiced = points.filter((p) => p.v !== null) as { t: number; v: number }[];
  if (voiced.length === 0) return [];
  const first = points.findIndex((p) => p.v !== null);
  let last = -1;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].v !== null) {
      last = i;
      break;
    }
  }
  const out: { t: number; v: number }[] = [];
  let prev = first;
  for (let i = first; i <= last; i++) {
    const p = points[i];
    if (p.v !== null) {
      out.push({ t: p.t, v: p.v });
      prev = i;
    } else {
      let next = i + 1;
      while (next <= last && points[next].v === null) next++;
      const a = points[prev];
      const b = points[next];
      const f = (p.t - a.t) / (b.t - a.t);
      out.push({ t: p.t, v: (a.v as number) + f * ((b.v as number) - (a.v as number)) });
    }
  }
  return out;
}

export function movingAverage(values: number[], window: number): number[] {
  if (window <= 1) return values.slice();
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      sum += values[j];
      n++;
    }
    return sum / n;
  });
}

/** Linear resample of a series to n points. */
export function resample(values: number[], n: number): number[] {
  if (values.length === 0) return [];
  if (values.length === 1) return Array(n).fill(values[0]);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * (values.length - 1);
    const lo = Math.floor(x);
    const hi = Math.min(values.length - 1, lo + 1);
    out.push(values[lo] + (x - lo) * (values[hi] - values[lo]));
  }
  return out;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const s = values.slice().sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo] + (idx - lo) * (s[hi] - s[lo]);
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
}

function round(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

// A learner's "normal voice" (level 2) for one take. Pure.
//
// The plain median of the whole take moves with the tune itself: hold the high end of a rising question a little longer and
// your "normal" goes up, so the end no longer looks high; a big peak pulls it up and the low end of a fall looks less low.
// The course's tunes say which part of the sentence IS level 2 (everything before the peak), so the baseline is taken from
// the frames that fall in those parts. With too few of them it falls back to the median of the whole take.

import { GRID_STEP, layoutSentence, targetContour } from "../intonation/contour.ts";
import type { Sentence } from "../intonation/types.ts";
import { median, type PitchFrame } from "./pitch.ts";

export function speakerBaseline(frames: readonly PitchFrame[], sentence: Sentence): number | null {
  const voiced = frames.filter((f) => f.hz !== null) as (PitchFrame & { hz: number })[];
  if (voiced.length < 5) return null;
  const all = median(voiced.map((f) => f.hz));
  const layout = layoutSentence(sentence);
  if (layout.slots.length === 0) return all;
  const target = targetContour(layout);
  // the voiced span of the take is laid over the sentence, first syllable to last
  const a = layout.slots[0].start;
  const b = layout.slots[layout.slots.length - 1].end;
  const t0 = voiced[0].time;
  const span = Math.max(1e-6, voiced[voiced.length - 1].time - t0);
  const mid: number[] = [];
  for (const f of voiced) {
    const t = a + ((f.time - t0) / span) * (b - a);
    const v = target[Math.min(target.length - 1, Math.max(0, Math.round(t / GRID_STEP)))]?.v;
    if (v != null && Math.abs(v - 2) <= 0.25) mid.push(f.hz);
  }
  return mid.length >= Math.max(6, 0.15 * voiced.length) ? median(mid) : all;
}

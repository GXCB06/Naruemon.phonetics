// Re-pitching a recording with TD-PSOLA (time-domain pitch-synchronous overlap-add). Pure: no DOM, no network.
//
// Why: asking a neural voice for a falling, rising or flat tune only works some of the time (it ignores pitch markup on short
// phrases), so about 165 practice clips could not be made. Here ONE natural reading of the sentence is taken as it comes and its
// pitch is replaced, voiced stretch by voiced stretch, with the exact line we want. Timing, loudness and the voice itself stay
// the same; only the pitch moves. Pitch changes of a few semitones (the course's levels are 4 semitones apart) sound natural
// with this method.
//
//   1. find the voiced stretches and the pitch period inside them (from the pitch track)
//   2. mark one point per period (the signal's own peaks)
//   3. cut a Hann-windowed grain of two periods around each analysis mark
//   4. lay the grains down again at the NEW period (closer together = higher, further apart = lower), reusing or skipping
//      grains so that the duration does not change
//   5. everything unvoiced (breaths, s, f, silence) is copied untouched, with short cross-fades at the joins

import type { PitchFrame } from "../audio/pitch.ts";

export interface RepitchOptions {
  /** Voiced stretches shorter than this are left alone (seconds). */
  minVoicedSec?: number;
  /** Cross-fade at the edge of every re-pitched stretch (seconds). */
  fadeSec?: number;
  /** Lowest and highest pitch the method works with (Hz). */
  minHz?: number;
  maxHz?: number;
}

const DEFAULTS: Required<RepitchOptions> = { minVoicedSec: 0.04, fadeSec: 0.012, minHz: 70, maxHz: 500 };

interface Segment {
  /** Sample range [a, b). */
  a: number;
  b: number;
}

/** The pitch (Hz) at time t from the frames of the track: linear between voiced frames, null beyond a voiced stretch. */
function makeF0At(frames: readonly PitchFrame[]): (t: number) => number | null {
  const voiced = frames.filter((f) => f.hz !== null) as (PitchFrame & { hz: number })[];
  return (t) => {
    if (voiced.length === 0) return null;
    // binary search for the frame at or before t
    let lo = 0;
    let hi = voiced.length - 1;
    if (t <= voiced[0].time) return t >= voiced[0].time - 0.03 ? voiced[0].hz : null;
    if (t >= voiced[hi].time) return t <= voiced[hi].time + 0.03 ? voiced[hi].hz : null;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (voiced[mid].time <= t) lo = mid;
      else hi = mid;
    }
    const a = voiced[lo];
    const b = voiced[hi];
    if (b.time - a.time > 0.05) return t - a.time < b.time - t ? (t - a.time < 0.03 ? a.hz : null) : b.time - t < 0.03 ? b.hz : null;
    const k = (t - a.time) / (b.time - a.time);
    return a.hz * (1 - k) + b.hz * k;
  };
}

/** Voiced stretches as sample ranges: runs of voiced frames, bridging gaps of up to 3 frames (30 ms). */
function voicedSegments(frames: readonly PitchFrame[], sampleRate: number, length: number, minSec: number): Segment[] {
  const segs: { t0: number; t1: number }[] = [];
  let open: { t0: number; t1: number } | null = null;
  for (const f of frames) {
    if (f.hz === null) continue;
    if (open && f.time - open.t1 <= 0.035) open.t1 = f.time;
    else {
      if (open) segs.push(open);
      open = { t0: f.time, t1: f.time };
    }
  }
  if (open) segs.push(open);
  return segs
    .filter((s) => s.t1 - s.t0 >= minSec)
    .map((s) => ({ a: Math.max(0, Math.floor((s.t0 - 0.005) * sampleRate)), b: Math.min(length, Math.ceil((s.t1 + 0.005) * sampleRate)) }));
}

/** One mark per period inside a segment: forward from the strongest peak near the start, each snapped to the local peak. */
function pitchMarks(x: Float32Array, seg: Segment, sampleRate: number, f0At: (t: number) => number | null, opt: Required<RepitchOptions>): number[] {
  const period = (n: number) => {
    const hz = f0At(n / sampleRate);
    const clamped = Math.max(opt.minHz, Math.min(opt.maxHz, hz ?? 120));
    return sampleRate / clamped;
  };
  // polarity: speech has a dominant positive or negative peak; follow the same sign all the way for consistent marks
  let skew = 0;
  for (let n = seg.a; n < seg.b; n++) skew += x[n] * x[n] * x[n];
  const sign = skew >= 0 ? 1 : -1;
  const peakNear = (centre: number, half: number) => {
    let best = Math.max(seg.a, Math.round(centre));
    let bv = -Infinity;
    for (let n = Math.max(seg.a, Math.round(centre - half)); n <= Math.min(seg.b - 1, Math.round(centre + half)); n++) {
      const v = sign * x[n];
      if (v > bv) {
        bv = v;
        best = n;
      }
    }
    return best;
  };
  // snap the next mark to the position whose waveform (one period around it) looks most like the one around the mark before it:
  // a vowel with two strong peaks per period (an r-coloured one) has no reliable single peak, but its shape repeats
  const similarNear = (from: number, centre: number, half: number, T: number) => {
    const len = Math.max(4, Math.round(T));
    const h = len >> 1;
    let best = Math.round(centre);
    let bs = -Infinity;
    for (let c = Math.round(centre - half); c <= Math.round(centre + half); c++) {
      if (c - h < seg.a || c + h > seg.b || from - h < 0) continue;
      let xy = 0;
      let yy = 1e-12;
      let xx = 1e-12;
      for (let k = -h; k < h; k++) {
        const a = x[from + k];
        const b = x[c + k];
        xy += a * b;
        xx += a * a;
        yy += b * b;
      }
      const s = xy / Math.sqrt(xx * yy);
      if (s > bs) {
        bs = s;
        best = c;
      }
    }
    return best;
  };
  const marks: number[] = [];
  const first = peakNear(seg.a + period(seg.a) * 0.6, period(seg.a) * 0.6);
  // go backwards to the start of the segment, then forwards to its end, so every period of the stretch has a mark
  const back: number[] = [];
  let m = first;
  for (;;) {
    const T = period(m);
    const prev = similarNear(m, m - T, 0.2 * T, T);
    if (prev >= m - 0.5 * T || prev - 0.5 * T < seg.a) break;
    back.push(prev);
    m = prev;
  }
  marks.push(...back.reverse(), first);
  m = first;
  for (;;) {
    const T = period(m);
    const next = similarNear(m, m + T, 0.2 * T, T);
    if (next <= m + 0.5 * T || next + 0.5 * T > seg.b) break;
    marks.push(next);
    m = next;
  }
  return marks;
}

const hann = (n: number, len: number) => 0.5 - 0.5 * Math.cos((2 * Math.PI * (n + 0.5)) / len);

/**
 * Give the voiced parts of `samples` a new pitch line. `f0` is the pitch track of `samples` (from `trackPitch`); `targetHz(t)`
 * is the pitch wanted at time t (seconds). The result has the same length and timing as the input.
 */
export function repitch(
  samples: Float32Array,
  sampleRate: number,
  f0: readonly PitchFrame[],
  targetHz: (t: number) => number,
  options: RepitchOptions = {},
): Float32Array {
  const opt = { ...DEFAULTS, ...options };
  const f0At = makeF0At(f0);
  const segments = voicedSegments(f0, sampleRate, samples.length, opt.minVoicedSec);
  const syn = new Float32Array(samples.length);
  const weight = new Float32Array(samples.length);
  const norm = new Float32Array(samples.length);
  const fade = Math.max(1, Math.round(opt.fadeSec * sampleRate));

  for (const seg of segments) {
    const marks = pitchMarks(samples, seg, sampleRate, f0At, opt);
    if (marks.length < 3) continue;
    // the local analysis period at each mark: half the distance between its neighbours
    const Ta = marks.map((m, i) => {
      const prev = marks[Math.max(0, i - 1)];
      const next = marks[Math.min(marks.length - 1, i + 1)];
      return Math.max(8, (next - prev) / (i === 0 || i === marks.length - 1 ? 1 : 2));
    });

    // synthesis marks from the first to the last analysis mark, spaced by the TARGET period
    let s = marks[0];
    let a = 0;
    while (s <= marks[marks.length - 1] + 0.5) {
      // the analysis mark nearest in time (duration is kept, so grains are reused or skipped as the spacing changes)
      while (a + 1 < marks.length && Math.abs(marks[a + 1] - s) <= Math.abs(marks[a] - s)) a++;
      const wanted = Math.max(opt.minHz, Math.min(opt.maxHz, targetHz(s / sampleRate)));
      const Ts = sampleRate / wanted;
      const half = Math.round(Ta[a]); // grain = two analysis periods, centred on the mark
      for (let k = -half; k < half; k++) {
        const src = marks[a] + k;
        const dst = Math.round(s) + k;
        if (src < 0 || src >= samples.length || dst < 0 || dst >= samples.length) continue;
        const w = hann(k + half, 2 * half);
        syn[dst] += samples[src] * w;
        norm[dst] += w;
      }
      s += Ts;
    }

    // weight 1 inside the stretch, ramping over `fade` samples at both ends
    for (let n = seg.a; n < seg.b; n++) {
      const edge = Math.min(n - seg.a, seg.b - 1 - n);
      weight[n] = Math.max(weight[n], Math.min(1, (edge + 1) / fade));
    }
  }

  // dividing by the summed window keeps the level steady however much the grains overlap (a steadier waveform than a fixed gain)
  const out = new Float32Array(samples.length);
  for (let n = 0; n < out.length; n++) {
    const re = norm[n] > 0.3 ? syn[n] / norm[n] : syn[n] / 0.3;
    out[n] = (1 - weight[n]) * samples[n] + weight[n] * re;
  }
  return out;
}

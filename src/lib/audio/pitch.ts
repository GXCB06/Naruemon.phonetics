import { PitchDetector } from "pitchy";
import { semitonesToLevel } from "../intonation/contour.ts";
import type { Contour } from "../intonation/types.ts";

// Speech pitch tracking with pitchy (McLeod Pitch Method) plus the clean-up pitchy doesn't do itself:
// a loudness gate, clarity gate, octave-jump repair, median smoothing and removal of tiny voiced blips.

export const PITCH_DEFAULTS = {
  windowSec: 0.04,
  hopSec: 0.01,
  minHz: 70,
  maxHz: 500,
  minClarity: 0.85,
  /** Frames quieter than this (dB below the loudest frame) count as unvoiced. */
  gateDb: -30,
  /** Shortest voiced run kept (seconds). */
  minRunSec: 0.04,
};

export interface PitchFrame {
  time: number;
  hz: number | null;
  clarity: number;
  rms: number;
}

export type PitchOptions = Partial<typeof PITCH_DEFAULTS>;

export function trackPitch(samples: Float32Array, sampleRate: number, options: PitchOptions = {}): PitchFrame[] {
  const o = { ...PITCH_DEFAULTS, ...options };
  const win = Math.round(o.windowSec * sampleRate);
  const hop = Math.max(1, Math.round(o.hopSec * sampleRate));
  if (samples.length < win) return [];
  const detector = PitchDetector.forFloat32Array(win);
  detector.minVolumeDecibels = -60;

  const raw: PitchFrame[] = [];
  let maxRms = 0;
  for (let start = 0; start + win <= samples.length; start += hop) {
    const frame = samples.subarray(start, start + win);
    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
    const rms = Math.sqrt(sum / frame.length);
    maxRms = Math.max(maxRms, rms);
    const [hz, clarity] = detector.findPitch(frame, sampleRate);
    raw.push({ time: (start + win / 2) / sampleRate, hz: hz > 0 ? hz : null, clarity, rms });
  }
  const gate = maxRms * Math.pow(10, o.gateDb / 20);
  const gated = raw.map((f) => ({
    ...f,
    hz: f.hz !== null && f.clarity >= o.minClarity && f.rms >= gate && f.hz >= o.minHz && f.hz <= o.maxHz ? f.hz : null,
  }));
  return cleanPitch(gated, Math.max(1, Math.round(o.minRunSec / o.hopSec)));
}

/**
 * Pitch of a learner's recording: the normal track, plus the trail-off. The end of a sentence is often quiet and creaky, which
 * the normal clarity and loudness gates drop, so a voice that really went low looks as if it stopped high. A second, more
 * permissive pass may only ADD frames just after the last normal one, and only as low as or lower than it (never a new rise).
 */
export function trackSpeech(samples: Float32Array, sampleRate: number, options: PitchOptions = {}): PitchFrame[] {
  const strict = trackPitch(samples, sampleRate, options);
  const relaxed = trackPitch(samples, sampleRate, { ...options, minClarity: 0.7, gateDb: -40 });
  return extendTail(strict, relaxed);
}

/** Adds the voiced frames of `relaxed` that follow the last voiced frame of `strict` (see `trackSpeech`). Pure. */
export function extendTail(strict: PitchFrame[], relaxed: PitchFrame[], maxExtraSec = 0.3): PitchFrame[] {
  let last = -1;
  for (let i = strict.length - 1; i >= 0; i--) {
    if (strict[i].hz !== null) {
      last = i;
      break;
    }
  }
  if (last < 0) return strict;
  const tEnd = strict[last].time;
  const ceiling = (strict[last].hz as number) * 1.12;
  const take = new Map<number, number>(); // frame time (ms) -> hz
  let prev = tEnd;
  for (const f of relaxed) {
    if (f.time <= tEnd + 1e-9) continue;
    if (f.time > tEnd + maxExtraSec) break;
    if (f.hz === null || f.hz > ceiling) continue;
    if (f.time - prev > 0.04) break; // the trail has ended: do not bridge a gap
    take.set(Math.round(f.time * 1000), f.hz);
    prev = f.time;
  }
  if (take.size === 0) return strict;
  return strict.map((f) => (f.hz === null && take.has(Math.round(f.time * 1000)) ? { ...f, hz: take.get(Math.round(f.time * 1000)) as number } : f));
}

/** Octave repair → median filter → drop voiced runs shorter than `minRun` frames. */
export function cleanPitch(frames: PitchFrame[], minRun = 4): PitchFrame[] {
  const voiced = frames.filter((f) => f.hz !== null).map((f) => f.hz as number);
  if (voiced.length === 0) return frames;
  const ref = median(voiced);
  // 1. Octave jumps: fold values that are ~double or ~half of the speaker's median.
  let out = frames.map((f) => {
    if (f.hz === null) return f;
    let hz = f.hz;
    while (hz / ref > 1.75) hz /= 2;
    while (ref / hz > 1.75) hz *= 2;
    return { ...f, hz };
  });
  // 2. Median filter (5 frames) over voiced neighbours only.
  out = out.map((f, i) => {
    if (f.hz === null) return f;
    const neigh: number[] = [];
    for (let j = i - 2; j <= i + 2; j++) {
      const h = out[j]?.hz;
      if (h != null) neigh.push(h);
    }
    return { ...f, hz: median(neigh) };
  });
  // 3. Remove isolated short voiced runs (clicks, breaths).
  let i = 0;
  while (i < out.length) {
    if (out[i].hz === null) {
      i++;
      continue;
    }
    let j = i;
    while (j < out.length && out[j].hz !== null) j++;
    if (j - i < minRun) for (let k = i; k < j; k++) out[k] = { ...out[k], hz: null };
    i = j;
  }
  return out;
}

export interface LevelContour {
  contour: Contour;
  baselineHz: number;
  /** Seconds from the first to the last voiced frame. */
  durationSec: number;
  /** Seconds of the first voiced frame (to line audio up with the chart). */
  startSec: number;
}

/**
 * Convert Hz to the course's 1–4 levels relative to this speaker.
 * Baseline (= level 2) is the median pitch of the utterance unless `baseline` is given (see speakerBaseline), so male and
 * female voices compare fairly.
 */
export function toLevelContour(frames: PitchFrame[], baseline?: number | null): LevelContour | null {
  const voiced = frames.filter((f) => f.hz !== null);
  if (voiced.length < 5) return null;
  const baselineHz = baseline && baseline > 0 ? baseline : median(voiced.map((f) => f.hz as number));
  const t0 = voiced[0].time;
  const t1 = voiced[voiced.length - 1].time;
  const dur = Math.max(1e-6, t1 - t0);
  const contour: Contour = frames
    .filter((f) => f.time >= t0 && f.time <= t1)
    .map((f) => ({
      t: (f.time - t0) / dur,
      v: f.hz === null ? null : semitonesToLevel(12 * Math.log2(f.hz / baselineHz)),
    }));
  return { contour, baselineHz, durationSec: dur, startSec: t0 };
}

/** Single-window pitch for the live line while recording. */
export function makeLivePitch(sampleRate: number) {
  const win = Math.round(PITCH_DEFAULTS.windowSec * sampleRate);
  const detector = PitchDetector.forFloat32Array(win);
  detector.minVolumeDecibels = -45;
  return {
    windowLength: win,
    detect(buf: Float32Array): number | null {
      const [hz, clarity] = detector.findPitch(buf, sampleRate);
      return clarity >= PITCH_DEFAULTS.minClarity && hz >= PITCH_DEFAULTS.minHz && hz <= PITCH_DEFAULTS.maxHz ? hz : null;
    },
  };
}

export function median(values: number[]): number {
  const s = values.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

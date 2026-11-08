// Live coaching signals while the learner speaks: pitch direction, pitch range and volume.
// Pure (no DOM, no React). Inputs are the rolling live-pitch points and per-chunk loudness measured in the recorder callback.

export interface LivePoint {
  /** Seconds since recording started. */
  t: number;
  /** Detected pitch, or null when unvoiced. */
  hz: number | null;
}

export interface LevelSample {
  t: number;
  /** Mean-square loudness of the chunk in dBFS (same idea as `assessQuality`). */
  db: number;
  /** Largest absolute sample in the chunk. */
  peak: number;
  /** Whether the pitch tracker found a voice in this chunk. */
  voiced: boolean;
}

export const LIVE_DEFAULTS = {
  /** Direction is measured over this much recent time. */
  directionWindowSec: 0.3,
  /** Fewer voiced points than this in the window → no direction yet. */
  directionMinPoints: 3,
  /** A change of at least this many semitones across the window counts as rising/falling. */
  directionThresholdSt: 1.2,
  /** Voice must span at least this long inside the window. */
  directionMinSpanSec: 0.1,
  /** A voice staying under this many semitones (p90 − p10) sounds monotone. */
  monotoneRangeSt: 3,
  /** …once this much voiced speech has been heard. */
  monotoneAfterVoicedSec: 1.5,
  /** Meter shows the range up to this many semitones as "full". */
  meterFullSt: 8,
  /** Longest gap between two points that still counts as continuous voiced time. */
  maxPointGapSec: 0.1,
  /** Voiced loudness below this is too quiet (same threshold as quality.ts "Too quiet"). */
  quietDb: -40,
  /** A peak at or above this is clipping (quality.ts uses 0.99). */
  clipPeak: 0.99,
  /** Volume looks at this much recent time. */
  volumeWindowSec: 1.5,
  volumeMinVoicedChunks: 3,
} as const;

export type Direction = "rising" | "falling" | "flat" | "none";
export type RangeStatus = "measuring" | "ok" | "narrow";
export type VolumeStatus = "waiting" | "ok" | "quiet" | "clipping";

export interface LiveRange {
  status: RangeStatus;
  /** p90 − p10 in semitones, or null before enough voice. */
  semitones: number | null;
  /** 0..1 fill for the meter. */
  fill: number;
  /** Seconds of voiced speech heard so far. */
  voicedSec: number;
}

export interface LiveSnapshot {
  direction: Direction;
  /** Semitone change across the direction window (positive = up), null when direction is "none". */
  directionSt: number | null;
  range: LiveRange;
  volume: VolumeStatus;
}

export const semitonesBetween = (hz: number, refHz: number): number => 12 * Math.log2(hz / refHz);

function percentile(sorted: number[], p: number): number {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/** Theil–Sen slope (median of pairwise slopes): robust against a stray octave error. Units: y per second. */
function robustSlope(xs: number[], ys: number[]): number {
  const slopes: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      const dx = xs[j] - xs[i];
      if (dx > 1e-6) slopes.push((ys[j] - ys[i]) / dx);
    }
  }
  if (!slopes.length) return 0;
  slopes.sort((a, b) => a - b);
  return percentile(slopes, 0.5);
}

/** Direction of the voice over the last ~300 ms. Unvoiced points are ignored. */
export function liveDirection(
  points: readonly LivePoint[],
  opts: Partial<Pick<typeof LIVE_DEFAULTS, "directionWindowSec" | "directionThresholdSt">> = {},
): { direction: Direction; semitones: number | null } {
  const windowSec = opts.directionWindowSec ?? LIVE_DEFAULTS.directionWindowSec;
  const threshold = opts.directionThresholdSt ?? LIVE_DEFAULTS.directionThresholdSt;
  if (!points.length) return { direction: "none", semitones: null };
  const now = points[points.length - 1].t;
  const ts: number[] = [];
  const st: number[] = [];
  for (let i = points.length - 1; i >= 0 && points[i].t >= now - windowSec; i--) {
    const hz = points[i].hz;
    if (hz === null) continue;
    ts.push(points[i].t);
    st.push(semitonesBetween(hz, 100));
  }
  ts.reverse();
  st.reverse();
  if (ts.length < LIVE_DEFAULTS.directionMinPoints || ts[ts.length - 1] - ts[0] < LIVE_DEFAULTS.directionMinSpanSec) {
    return { direction: "none", semitones: null };
  }
  const change = robustSlope(ts, st) * windowSec;
  const direction: Direction = change >= threshold ? "rising" : change <= -threshold ? "falling" : "flat";
  return { direction, semitones: change };
}

/** Pitch range of the take so far (p90 − p10, semitones) and whether it sounds monotone. */
export function liveRange(points: readonly LivePoint[]): LiveRange {
  const voiced: number[] = [];
  let voicedSec = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.hz === null) continue;
    voiced.push(semitonesBetween(p.hz, 100));
    const gap = i > 0 ? p.t - points[i - 1].t : LIVE_DEFAULTS.maxPointGapSec;
    voicedSec += Math.min(Math.max(gap, 0), LIVE_DEFAULTS.maxPointGapSec);
  }
  if (voiced.length < 8) return { status: "measuring", semitones: null, fill: 0, voicedSec };
  const sorted = voiced.slice().sort((a, b) => a - b);
  const range = percentile(sorted, 0.9) - percentile(sorted, 0.1);
  const fill = Math.max(0, Math.min(1, range / LIVE_DEFAULTS.meterFullSt));
  let status: RangeStatus = "ok";
  if (range < LIVE_DEFAULTS.monotoneRangeSt) {
    status = voicedSec > LIVE_DEFAULTS.monotoneAfterVoicedSec ? "narrow" : "measuring";
  }
  return { status, semitones: range, fill, voicedSec };
}

/** Loudness of one audio chunk: mean-square dBFS (as in `assessQuality`) and peak. */
export function chunkLevel(chunk: Float32Array): { db: number; peak: number } {
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < chunk.length; i++) {
    const v = chunk[i];
    sum += v * v;
    const a = Math.abs(v);
    if (a > peak) peak = a;
  }
  return { db: 10 * Math.log10(sum / Math.max(1, chunk.length) + 1e-12), peak };
}

/** Is the voice too quiet or clipping? Looks at the last ~1.5 s; stays "waiting" until some voice was heard. */
export function liveVolume(levels: readonly LevelSample[]): VolumeStatus {
  if (!levels.length) return "waiting";
  const now = levels[levels.length - 1].t;
  const recent: LevelSample[] = [];
  for (let i = levels.length - 1; i >= 0 && levels[i].t >= now - LIVE_DEFAULTS.volumeWindowSec; i--) {
    recent.push(levels[i]);
  }
  const clipped = recent.filter((l) => l.peak >= LIVE_DEFAULTS.clipPeak).length;
  if (clipped >= 2) return "clipping";
  const voicedDb = recent.filter((l) => l.voiced).map((l) => l.db);
  if (voicedDb.length < LIVE_DEFAULTS.volumeMinVoicedChunks) return "waiting";
  voicedDb.sort((a, b) => a - b);
  return percentile(voicedDb, 0.5) < LIVE_DEFAULTS.quietDb ? "quiet" : "ok";
}

export function liveSnapshot(points: readonly LivePoint[], levels: readonly LevelSample[]): LiveSnapshot {
  const d = liveDirection(points);
  return { direction: d.direction, directionSt: d.semitones, range: liveRange(points), volume: liveVolume(levels) };
}

export const EMPTY_SNAPSHOT: LiveSnapshot = {
  direction: "none",
  directionSt: null,
  range: { status: "measuring", semitones: null, fill: 0, voicedSec: 0 },
  volume: "waiting",
};

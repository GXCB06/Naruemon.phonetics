import { describe, expect, it } from "vitest";
import {
  chunkLevel,
  liveDirection,
  liveRange,
  liveSnapshot,
  liveVolume,
  semitonesBetween,
  type LevelSample,
  type LivePoint,
} from "./liveDirection.ts";

const HOP = 0.043; // one live point per 2048-sample chunk at 48 kHz

/** Points following `hzAt(t)` for `sec` seconds starting at t0. */
function track(hzAt: (t: number) => number | null, sec: number, t0 = 0): LivePoint[] {
  const out: LivePoint[] = [];
  for (let t = t0; t <= t0 + sec + 1e-9; t += HOP) out.push({ t, hz: hzAt(t) });
  return out;
}
const hzFromSt = (st: number) => 100 * 2 ** (st / 12);

describe("liveDirection", () => {
  it("sees a rise over the last 300 ms", () => {
    const pts = track((t) => hzFromSt(10 + 12 * t), 1); // +12 st per second → +3.6 st per 300 ms
    expect(liveDirection(pts).direction).toBe("rising");
  });

  it("sees a fall", () => {
    const pts = track((t) => hzFromSt(20 - 12 * t), 1);
    const d = liveDirection(pts);
    expect(d.direction).toBe("falling");
    expect(d.semitones).toBeLessThan(-1.2);
  });

  it("calls a steady voice flat, even with a little jitter", () => {
    const pts = track((t) => hzFromSt(10 + 0.2 * Math.sin(t * 40)), 1);
    expect(liveDirection(pts).direction).toBe("flat");
  });

  it("only looks at the last ~300 ms (an old rise followed by a hold is flat)", () => {
    const pts = [
      ...track((t) => hzFromSt(10 + 12 * t), 0.5),
      ...track(() => hzFromSt(16), 0.6, 0.55),
    ];
    expect(liveDirection(pts).direction).toBe("flat");
  });

  it("ignores unvoiced points instead of treating them as a drop", () => {
    // rising voice with unvoiced gaps in between
    const pts = track((t) => hzFromSt(10 + 12 * t), 1).map((p, i) => (i % 3 === 1 ? { ...p, hz: null } : p));
    expect(liveDirection(pts).direction).toBe("rising");
  });

  it("is robust to a single octave error", () => {
    const pts = track(() => hzFromSt(10), 0.6);
    pts[pts.length - 3] = { ...pts[pts.length - 3], hz: hzFromSt(22) };
    expect(liveDirection(pts).direction).toBe("flat");
  });

  it("says none when there is no voice in the window", () => {
    expect(liveDirection([]).direction).toBe("none");
    const silent = track(() => null, 1);
    expect(liveDirection(silent).direction).toBe("none");
    const voiceThenSilence = [...track(() => hzFromSt(10), 0.5), ...track(() => null, 0.5, 0.55)];
    expect(liveDirection(voiceThenSilence).direction).toBe("none");
  });
});

describe("liveRange", () => {
  it("is still measuring with little voice", () => {
    expect(liveRange(track(() => hzFromSt(10), 0.2)).status).toBe("measuring");
  });

  it("measures p90 − p10 in semitones", () => {
    // sweep evenly 0..12 st over 2 s → p90 − p10 ≈ 9.6 st
    const pts = track((t) => hzFromSt(6 * t), 2);
    const r = liveRange(pts);
    expect(r.semitones).toBeGreaterThan(9);
    expect(r.semitones).toBeLessThan(10.2);
    expect(r.status).toBe("ok");
    expect(r.fill).toBe(1);
  });

  it("goes amber when the voice stays under ~3 st for more than 1.5 s of voiced speech", () => {
    const monotone = track((t) => hzFromSt(10 + 0.6 * Math.sin(t * 7)), 2);
    const r = liveRange(monotone);
    expect(r.semitones).toBeLessThan(3);
    expect(r.voicedSec).toBeGreaterThan(1.5);
    expect(r.status).toBe("narrow");
  });

  it("does not nag during the first second and a half", () => {
    const early = track((t) => hzFromSt(10 + 0.3 * Math.sin(t * 7)), 1.2);
    expect(liveRange(early).status).toBe("measuring");
  });

  it("counts only voiced time, not silence", () => {
    // 3 s long, but only the first 1 s is voiced
    const pts = [...track(() => hzFromSt(10), 1), ...track(() => null, 2, 1.05)];
    const r = liveRange(pts);
    expect(r.voicedSec).toBeLessThan(1.2);
    expect(r.status).toBe("measuring");
  });

  it("recovers to ok once the voice moves", () => {
    const pts = [
      ...track(() => hzFromSt(10), 1.8),
      ...track((t) => hzFromSt(10 + 14 * ((t - 1.85) / 1)), 1, 1.85),
    ];
    expect(liveRange(pts).status).toBe("ok");
  });
});

describe("volume", () => {
  const lv = (n: number, db: number, peak = 0.3, voiced = true, t0 = 0): LevelSample[] =>
    Array.from({ length: n }, (_, i) => ({ t: t0 + i * HOP, db, peak, voiced }));

  it("measures a chunk like assessQuality (dBFS of mean square)", () => {
    const sine = new Float32Array(2048).map((_, i) => 0.5 * Math.sin((2 * Math.PI * 200 * i) / 48000));
    const { db, peak } = chunkLevel(sine);
    expect(db).toBeCloseTo(10 * Math.log10(0.125), 0);
    expect(peak).toBeCloseTo(0.5, 2);
  });

  it("waits until some voice has been heard (no scolding in silence)", () => {
    expect(liveVolume([])).toBe("waiting");
    expect(liveVolume(lv(30, -60, 0.001, false))).toBe("waiting");
  });

  it("flags a quiet voice", () => {
    expect(liveVolume(lv(30, -46))).toBe("quiet");
  });

  it("accepts a normal voice", () => {
    expect(liveVolume(lv(30, -24))).toBe("ok");
  });

  it("flags clipping, but not a single stray click", () => {
    expect(liveVolume([...lv(20, -20), ...lv(4, -8, 1, true, 1)])).toBe("clipping");
    const one = lv(30, -20);
    one[10] = { ...one[10], peak: 1 };
    expect(liveVolume(one)).toBe("ok");
  });

  it("forgets old problems after ~1.5 s", () => {
    const loudThenFine = [...lv(10, -8, 1), ...lv(60, -22, 0.4, true, 10 * HOP)];
    expect(liveVolume(loudThenFine)).toBe("ok");
  });
});

describe("liveSnapshot", () => {
  it("bundles direction, range and volume", () => {
    const pts = track((t) => hzFromSt(8 * t), 1.5);
    const levels = pts.map((p) => ({ t: p.t, db: -25, peak: 0.3, voiced: p.hz !== null }));
    const s = liveSnapshot(pts, levels);
    expect(s.direction).toBe("rising");
    expect(s.range.semitones).toBeGreaterThan(5);
    expect(s.volume).toBe("ok");
  });

  it("maps hz to semitones", () => {
    expect(semitonesBetween(200, 100)).toBeCloseTo(12, 5);
  });
});

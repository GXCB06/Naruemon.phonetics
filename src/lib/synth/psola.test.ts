import { describe, expect, it } from "vitest";
import { trackPitch } from "../audio/pitch.ts";
import { repitch } from "./psola.ts";

const SR = 24000;

/** A voice-like signal: a pulse-train with harmonics falling off like 1/k, at a pitch that can change over time. */
function voice(sec: number, hz: (t: number) => number): Float32Array {
  const out = new Float32Array(Math.round(sec * SR));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const f = hz(i / SR);
    phase += (2 * Math.PI * f) / SR;
    let v = 0;
    for (let k = 1; k <= 18 && k * f < SR / 2.2; k++) v += Math.sin(k * phase) / k;
    out[i] = 0.35 * v * (0.8 + 0.2 * Math.sin(2 * Math.PI * 3 * (i / SR)));
  }
  return out;
}

const st = (hz: number, ref: number) => 12 * Math.log2(hz / ref);
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

/** The median pitch of the voiced frames in [t0, t1]. */
function pitchAt(x: Float32Array, t0: number, t1: number): number | null {
  const hz = trackPitch(x, SR)
    .filter((f) => f.hz !== null && f.time >= t0 && f.time <= t1)
    .map((f) => f.hz as number);
  return hz.length >= 4 ? median(hz) : null;
}

describe("re-pitching with TD-PSOLA", () => {
  const base = voice(1.2, () => 140);
  const track = trackPitch(base, SR);

  it("keeps the length and a steady pitch when the target is the original pitch", () => {
    const out = repitch(base, SR, track, () => 140);
    expect(out.length).toBe(base.length);
    const hz = pitchAt(out, 0.3, 0.9)!;
    expect(Math.abs(st(hz, 140))).toBeLessThan(0.8);
  });

  it("follows a rising target line", () => {
    const target = (t: number) => 140 * 2 ** ((t / 1.2) * (6 / 12)); // up 6 semitones over the clip
    const out = repitch(base, SR, track, target);
    for (const t of [0.25, 0.6, 0.95]) {
      const hz = pitchAt(out, t - 0.08, t + 0.08)!;
      expect(hz, `at ${t}s`).not.toBeNull();
      expect(Math.abs(st(hz, target(t))), `at ${t}s`).toBeLessThan(1.3);
    }
  });

  it("follows a falling target and a flat one, from a source that was moving the other way", () => {
    const moving = voice(1.2, (t) => 120 * 2 ** ((t / 1.2) * (5 / 12)));
    const movingTrack = trackPitch(moving, SR);
    const falling = (t: number) => 170 * 2 ** (-(t / 1.2) * (7 / 12));
    const out = repitch(moving, SR, movingTrack, falling);
    for (const t of [0.25, 0.6, 0.95]) expect(Math.abs(st(pitchAt(out, t - 0.08, t + 0.08)!, falling(t))), `falling at ${t}s`).toBeLessThan(1.4);
    const flat = repitch(moving, SR, movingTrack, () => 130);
    const lo = pitchAt(flat, 0.15, 0.4)!;
    const hi = pitchAt(flat, 0.8, 1.05)!;
    expect(Math.abs(st(hi, lo))).toBeLessThan(1.2);
  });

  it("leaves a stretch without pitch (a breath, an s) exactly as it was, away from the joins", () => {
    const gapStart = Math.round(0.5 * SR);
    const gapEnd = Math.round(0.7 * SR);
    const seed = { s: 7 };
    const rnd = () => ((seed.s = (seed.s * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5) * 0.2;
    const mixed = voice(1.2, () => 150);
    for (let n = gapStart; n < gapEnd; n++) mixed[n] = rnd();
    const out = repitch(mixed, SR, trackPitch(mixed, SR), () => 190);
    let same = 0;
    let total = 0;
    for (let n = gapStart + Math.round(0.03 * SR); n < gapEnd - Math.round(0.03 * SR); n++) {
      total++;
      if (out[n] === mixed[n]) same++;
    }
    expect(same / total).toBeGreaterThan(0.95);
  });

  it("keeps the loudness about the same", () => {
    const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
    const out = repitch(base, SR, track, () => 180);
    expect(rms(out) / rms(base)).toBeGreaterThan(0.7);
    expect(rms(out) / rms(base)).toBeLessThan(1.4);
  });

  it("returns the input unchanged when nothing is voiced, and never produces NaN", () => {
    const silence = new Float32Array(SR);
    expect(Array.from(repitch(silence, SR, trackPitch(silence, SR), () => 150)).every((v) => v === 0)).toBe(true);
    const out = repitch(base, SR, track, () => 150);
    expect(out.every((v) => Number.isFinite(v))).toBe(true);
  });
});

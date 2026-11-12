import { describe, expect, it } from "vitest";
import { median, trackPitch } from "./pitch.ts";
import { timeStretch } from "./stretch.ts";

const SR = 24000;
/** A voice-like pulse train whose pitch glides from 130 to 190 Hz over 1.2 s. */
function voice(sec: number): Float32Array {
  const out = new Float32Array(Math.round(sec * SR));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const f = 130 + 60 * (i / out.length);
    phase += (2 * Math.PI * f) / SR;
    let v = 0;
    for (let k = 1; k <= 15; k++) v += Math.sin(k * phase) / k;
    out[i] = 0.3 * v;
  }
  return out;
}
const pitch = (x: Float32Array, from: number, to: number) =>
  median(trackPitch(x, SR).filter((f) => f.hz !== null && f.time >= from && f.time <= to).map((f) => f.hz as number));

describe("slowing speech down without changing its pitch", () => {
  const x = voice(1.2);

  it("makes it 1/rate as long", () => {
    expect(timeStretch(x, SR, 0.7).length / x.length).toBeCloseTo(1 / 0.7, 2);
    expect(timeStretch(x, SR, 1).length).toBe(x.length);
  });

  it("keeps the pitch at the same point of the sentence (playbackRate would lower it ~6 semitones)", () => {
    const y = timeStretch(x, SR, 0.7);
    for (const p of [0.25, 0.5, 0.75]) {
      const a = pitch(x, p * 1.2 - 0.05, p * 1.2 + 0.05);
      const b = pitch(y, (p * 1.2) / 0.7 - 0.07, (p * 1.2) / 0.7 + 0.07);
      expect(Math.abs(12 * Math.log2(b / a)), `at ${p}`).toBeLessThan(0.7);
    }
  });

  it("keeps the loudness and never makes NaN", () => {
    const y = timeStretch(x, SR, 0.7);
    const rms = (s: Float32Array) => Math.sqrt(s.reduce((n, v) => n + v * v, 0) / s.length);
    expect(rms(y) / rms(x)).toBeGreaterThan(0.8);
    expect(rms(y) / rms(x)).toBeLessThan(1.2);
    expect(y.every(Number.isFinite)).toBe(true);
    expect(timeStretch(new Float32Array(0), SR, 0.7).length).toBe(0);
  });
});

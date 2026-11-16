import { describe, expect, it } from "vitest";
import { MAX_BOOST_DB, TARGET_SPEECH_DB, normalizeTake } from "./gain.ts";
import { speechLoudnessDb } from "./quality.ts";

const SR = 16000;

/** A speech-like signal: a 200 Hz tone with harmonics, at a chosen speech loudness (dBFS). */
function tone(levelDb: number, sec = 1): Float32Array {
  const n = Math.round(SR * sec);
  const amplitude = 10 ** (levelDb / 20) * Math.SQRT2; // a sine at this RMS
  return Float32Array.from({ length: n }, (_, i) => amplitude * Math.sin((2 * Math.PI * 200 * i) / SR));
}

const peakOf = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

describe("make-up gain for quiet takes", () => {
  it("lifts quiet speech to the target loudness", () => {
    const quiet = tone(-40);
    const out = normalizeTake(quiet, SR);
    expect(out.gainDb).toBeGreaterThan(15);
    expect(speechLoudnessDb(out.samples, SR)).toBeCloseTo(TARGET_SPEECH_DB, 0);
  });

  it("never boosts more than the cap", () => {
    const faint = tone(-80);
    const out = normalizeTake(faint, SR);
    expect(out.gainDb).toBe(MAX_BOOST_DB);
    expect(speechLoudnessDb(out.samples, SR)).toBeLessThan(TARGET_SPEECH_DB + 1);
  });

  it("leaves a loud take alone", () => {
    const loud = tone(-18);
    const out = normalizeTake(loud, SR);
    expect(out.gainDb).toBe(0);
    expect(out.samples).toBe(loud);
  });

  it("never raises the loudest sample past the ceiling", () => {
    // quiet overall, but one sample already near full scale: the boost must shrink (here to nothing) to protect it
    const spiky = tone(-45);
    spiky[100] = 0.99;
    const out = normalizeTake(spiky, SR);
    expect(out.gainDb).toBe(0);
    expect(peakOf(out.samples)).toBeLessThanOrEqual(0.99 + 1e-6);
  });

  it("does not amplify silence", () => {
    const silence = new Float32Array(SR);
    const out = normalizeTake(silence, SR);
    expect(out.gainDb).toBe(0);
    expect(out.samples).toBe(silence);
  });

  it("keeps the shape of the take (a gain is a scale, not a filter)", () => {
    const quiet = tone(-40);
    const out = normalizeTake(quiet, SR);
    const g = 10 ** (out.gainDb / 20);
    for (const i of [0, 17, 100, 1000]) expect(out.samples[i]).toBeCloseTo(quiet[i] * g, 2);
  });
});

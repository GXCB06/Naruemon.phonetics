import { describe, expect, it } from "vitest";
import { getSentence } from "../intonation/lessons.ts";
import { synthesizeSentence } from "../synth/voice.ts";
import {
  NOISE_FLOOR,
  assessNoiseFloor,
  frameDbs,
  looksLikeBluetooth,
  meterLevel,
  micDeviceWarnings,
  rmsDb,
  smoothMeterDb,
  testTakeVerdict,
} from "./quality.ts";

/** Deterministic white-ish noise at a given RMS level (dBFS). */
function noise(sr: number, sec: number, db: number, seed = 1): Float32Array {
  const out = new Float32Array(Math.round(sr * sec));
  let x = seed;
  for (let i = 0; i < out.length; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    out[i] = (x / 2147483648) * 2 - 1; // uniform in [-1, 1): RMS = 1/sqrt(3)
  }
  const gain = 10 ** (db / 20) * Math.sqrt(3);
  return out.map((v) => v * gain);
}

describe("mic check: level meter", () => {
  it("measures RMS in dBFS", () => {
    expect(rmsDb(new Float32Array(1000))).toBe(-120);
    expect(rmsDb(new Float32Array(1000).fill(0.5))).toBeCloseTo(-6.02, 1);
    expect(rmsDb(noise(48000, 0.5, -30))).toBeCloseTo(-30, 0);
  });

  it("maps dB to a 0..1 meter and clamps", () => {
    expect(meterLevel(-90)).toBe(0);
    expect(meterLevel(-30)).toBeCloseTo(0.5);
    expect(meterLevel(3)).toBe(1);
    expect(meterLevel(Number.NaN)).toBe(0);
  });

  it("rises at once and falls back slowly", () => {
    expect(smoothMeterDb(-50, -20, 0.05)).toBe(-20);
    expect(smoothMeterDb(-20, -60, 0.1)).toBeCloseTo(-23);
    expect(smoothMeterDb(-20, -21, 1)).toBe(-21);
  });

  it("splits audio into 20 ms frames", () => {
    expect(frameDbs(new Float32Array(48000), 48000)).toHaveLength(50);
  });
});

describe("mic check: noise floor", () => {
  const sr = 48000;
  it("calls a near-silent room quiet", () => {
    const r = assessNoiseFloor(noise(sr, 2, -70), sr);
    expect(r.verdict).toBe("quiet");
    expect(r.noiseDb).toBeLessThan(NOISE_FLOOR.quietBelowDb);
    expect(r.message.th.length).toBeGreaterThan(0);
  });

  it("calls a little hum ok and a loud room noisy", () => {
    expect(assessNoiseFloor(noise(sr, 2, -50), sr).verdict).toBe("ok");
    const loud = assessNoiseFloor(noise(sr, 2, -35), sr);
    expect(loud.verdict).toBe("noisy");
    expect(loud.message.level).toBe("warn");
  });

  it("ignores one short loud bump (a tap on the screen)", () => {
    const x = noise(sr, 2, -70);
    x.set(noise(sr, 0.15, -10, 7), sr); // 150 ms thump in the middle
    expect(assessNoiseFloor(x, sr).verdict).toBe("quiet");
  });
});

describe("mic check: device warnings", () => {
  it("spots Bluetooth headsets by label", () => {
    for (const l of ["AirPods Pro", "Galaxy Buds2", "Headset (Jabra Evolve2)", "Hands-Free AG Audio", "WH-1000XM4"])
      expect(looksLikeBluetooth(l), l).toBe(true);
    for (const l of ["iPad Microphone", "MacBook Pro Microphone", "Default - Microphone Array (Realtek)", "USB Audio Device"])
      expect(looksLikeBluetooth(l), l).toBe(false);
  });

  it("warns about Bluetooth, narrowband and odd rates; quiet for a normal built-in mic", () => {
    expect(micDeviceWarnings({ label: "iPad Microphone", contextRate: 48000, trackRate: 48000, rawAudio: true })).toEqual([]);
    const bt = micDeviceWarnings({ label: "AirPods", contextRate: 48000, trackRate: 16000, rawAudio: true });
    expect(bt.map((m) => m.en.slice(0, 20))).toEqual(["This looks like a Bl", "The mic runs at only"]);
    expect(micDeviceWarnings({ label: "", contextRate: 22050, rawAudio: true })[0].en).toMatch(/22 kHz/);
    expect(micDeviceWarnings({ label: "", contextRate: 50000, rawAudio: true })[0].en).toMatch(/Unusual/);
    expect(micDeviceWarnings({ label: "", contextRate: 44100, rawAudio: false })[0].en).toMatch(/processing/);
    for (const m of bt) expect(m.th.length).toBeGreaterThan(0);
  });
});

describe("mic check: 3-second test take", () => {
  const s = getSentence("fall-pretty-woman")!;

  it("a clear synthetic voice passes", () => {
    const { samples, sampleRate } = synthesizeSentence(s, { baseHz: 210 });
    const { summary } = testTakeVerdict(samples, sampleRate, -70);
    expect(summary.level).toBe("ok");
  });

  it("a whispered take fails as too quiet", () => {
    const { samples, sampleRate } = synthesizeSentence(s, { baseHz: 120 });
    const { summary } = testTakeVerdict(
      samples.map((v) => v * 0.003),
      sampleRate,
      -80,
    );
    expect(summary.level).toBe("fail");
    expect(summary.en).toMatch(/Too quiet/);
  });

  it("uses the measured room noise for the signal-to-noise check", () => {
    const { samples, sampleRate } = synthesizeSentence(s, { baseHz: 210 });
    const quietRoom = testTakeVerdict(samples, sampleRate, -70).report;
    const loudRoom = testTakeVerdict(samples, sampleRate, quietRoom.speechDb - 5).report;
    expect(quietRoom.snrDb).toBeGreaterThan(15);
    expect(loudRoom.issues.some((i) => i.en.startsWith("Your voice is close"))).toBe(true);
  });
});

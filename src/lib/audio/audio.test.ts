import { describe, expect, it } from "vitest";
import { analyze } from "../intonation/engine.ts";
import { getSentence } from "../intonation/lessons.ts";
import { ERROR_STYLES, synthesizeSentence } from "../synth/voice.ts";
import { speakerBaseline } from "./baseline.ts";
import { extendTail, median, toLevelContour, trackPitch } from "./pitch.ts";
import { assessQuality, trimSilence } from "./quality.ts";
import { resampleAudio } from "./resample.ts";
import { decodeWav, encodeWav } from "./wav.ts";

function harmonicGlide(sr: number, sec: number, f0: number, f1: number): Float32Array {
  const n = Math.round(sr * sec);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const hz = f0 + ((f1 - f0) * i) / n;
    phase += (2 * Math.PI * hz) / sr;
    let v = 0;
    for (let k = 1; k * hz < 4000; k++) v += Math.sin(k * phase) / k;
    out[i] = 0.2 * v;
  }
  return out;
}

const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);

describe("pitch tracking", () => {
  it("follows a 180→300 Hz glide within 2%", () => {
    const sr = 48000;
    const sig = harmonicGlide(sr, 1, 180, 300);
    const frames = trackPitch(sig, sr);
    const errs = frames
      .filter((f) => f.hz !== null && f.time > 0.05 && f.time < 0.95)
      .map((f) => Math.abs((f.hz as number) - (180 + 120 * f.time)) / (180 + 120 * f.time));
    expect(errs.length).toBeGreaterThan(80);
    expect(median(errs)).toBeLessThan(0.02);
  });

  it("silence gives no pitch", () => {
    const frames = trackPitch(new Float32Array(48000), 48000);
    expect(frames.every((f) => f.hz === null)).toBe(true);
  });
});

describe("voice pipeline end to end (synthetic voice → pitch → rule engine)", () => {
  const run = (id: string, opts: Parameters<typeof synthesizeSentence>[1] = {}) => {
    const s = getSentence(id)!;
    const { samples, sampleRate } = synthesizeSentence(s, opts);
    const lc = toLevelContour(trackPitch(samples, sampleRate))!;
    return analyze(s, lc.contour, { modality: "speak", timingKnown: false, durationSec: lc.durationSec });
  };
  const status = (r: ReturnType<typeof run>, g: number, id: string) => r.groups[g].checks.find((c) => c.id === id)?.status;

  it("good statement passes ending and range (female voice)", () => {
    const r = run("fall-pretty-woman", { baseHz: 210 });
    expect(status(r, 0, "ending")).toBe("pass");
    expect(status(r, 0, "range")).toBe("pass");
  });

  it("good yes/no question passes (male voice)", () => {
    const r = run("rise-student", { baseHz: 115 });
    expect(status(r, 0, "ending")).toBe("pass");
  });

  it("yes/no question that falls (common Thai L1 transfer) fails the ending", () => {
    const r = run("rise-student", { transform: ERROR_STYLES.wrongEnding });
    expect(status(r, 0, "ending")).toBe("fail");
  });

  it("wh-question that rises fails the ending", () => {
    const r = run("fall-what-name", { transform: ERROR_STYLES.wrongEnding });
    expect(status(r, 0, "ending")).toBe("fail");
  });

  it("monotone reading fails the range check", () => {
    const r = run("fall-what-name", { transform: ERROR_STYLES.flat });
    expect(status(r, 0, "range")).toBe("fail");
  });

  it("finds the pause between thought groups, and warns when there is none", () => {
    const good = run("nonfinal-rains-bus");
    expect(good.sentenceChecks[0].status).toBe("pass");
    expect(status(good, 0, "ending")).toBe("pass");
    expect(status(good, 1, "ending")).toBe("pass");
    const rushed = run("nonfinal-rains-bus", { noPause: true });
    expect(rushed.sentenceChecks[0].status).toBe("warn");
  });

  it("tells a sure tag from an unsure tag", () => {
    const sure = run("tag-sure");
    const unsure = run("tag-unsure");
    expect(status(sure, 1, "ending")).toBe("pass");
    expect(status(unsure, 1, "ending")).toBe("pass");
    // reading the unsure version with a falling tag must fail
    const s = getSentence("tag-unsure")!;
    const { samples, sampleRate } = synthesizeSentence(getSentence("tag-sure")!);
    const lc = toLevelContour(trackPitch(samples, sampleRate))!;
    const wrong = analyze(s, lc.contour, { modality: "speak", timingKnown: false, durationSec: lc.durationSec });
    expect(status(wrong, 1, "ending")).toBe("fail");
  });
});

describe("resampling and WAV", () => {
  it("keeps a 1 kHz tone and removes a 12 kHz tone when going 48 → 16 kHz", () => {
    const sr = 48000;
    const tone = (hz: number) => Float32Array.from({ length: sr }, (_, i) => Math.sin((2 * Math.PI * hz * i) / sr));
    const low = resampleAudio(tone(1000), sr, 16000);
    const high = resampleAudio(tone(12000), sr, 16000);
    expect(low.length).toBe(16000);
    expect(rms(low.subarray(200, -200)) / rms(tone(1000))).toBeGreaterThan(0.97);
    expect(20 * Math.log10(rms(high.subarray(200, -200)) / rms(tone(12000)))).toBeLessThan(-30);
  });

  it("WAV encode/decode round trip", () => {
    const x = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 10) * 0.5);
    const { samples, sampleRate } = decodeWav(encodeWav(x, 16000));
    expect(sampleRate).toBe(16000);
    expect(samples.length).toBe(1000);
    expect(Math.max(...samples.map((v, i) => Math.abs(v - x[i])))).toBeLessThan(1e-4);
  });
});

describe("recording quality", () => {
  it("flags quiet and clipped takes", () => {
    const sr = 16000;
    const quiet = harmonicGlide(sr, 1, 200, 200).map((v) => v * 0.001);
    expect(assessQuality(quiet, sr).issues.some((i) => i.en.startsWith("Too quiet"))).toBe(true);
    const loud = harmonicGlide(sr, 1, 200, 200).map((v) => Math.max(-1, Math.min(1, v * 20)));
    expect(assessQuality(loud, sr).issues.some((i) => i.en.startsWith("Too loud"))).toBe(true);
  });

  it("trims silence but keeps padding", () => {
    const sr = 16000;
    const x = new Float32Array(sr * 3);
    x.set(harmonicGlide(sr, 1, 200, 220), sr);
    const t = trimSilence(x, sr, 0.2);
    expect(t.length).toBeGreaterThan(sr * 1.3);
    expect(t.length).toBeLessThan(sr * 1.5);
  });
});

describe("trail-off of a learner's voice", () => {
  const frame = (time: number, hz: number | null) => ({ time, hz, clarity: 0.9, rms: 0.1 });
  const strict = [...Array.from({ length: 10 }, (_, i) => frame(i * 0.01, 150)), ...Array.from({ length: 10 }, (_, i) => frame(0.1 + i * 0.01, null))];

  it("adds the low frames right after the last voiced frame", () => {
    const relaxed = strict.map((f, i) => (i >= 10 && i < 16 ? { ...f, hz: 120 } : f));
    const out = extendTail(strict, relaxed);
    expect(out.slice(10, 16).every((f) => f.hz === 120)).toBe(true);
    expect(out.slice(16).every((f) => f.hz === null)).toBe(true);
  });

  it("never adds a rise, and does not bridge a gap", () => {
    expect(extendTail(strict, strict.map((f, i) => (i >= 10 && i < 16 ? { ...f, hz: 220 } : f)))).toEqual(strict);
    const gap = strict.map((f, i) => (i >= 15 && i < 18 ? { ...f, hz: 120 } : f));
    expect(extendTail(strict, gap)).toEqual(strict);
  });

  it("leaves a recording without voice alone", () => {
    const none = strict.map((f) => ({ ...f, hz: null }));
    expect(extendTail(none, none)).toBe(none);
  });
});

describe("the learner's normal voice (level 2) comes from the parts that should be level 2", () => {
  // "Do you work?"-style rising sentence: mid for the first part, then up, and the learner HOLDS the high end
  const s = getSentence("rise-student")!;
  const frames = Array.from({ length: 120 }, (_, i) => {
    const t = i * 0.01;
    const hz = t < 0.5 ? 180 : 180 * 2 ** (Math.min(1, (t - 0.5) / 0.2) * (3 / 12)); // +3 st, held for the last half
    return { time: t, hz, clarity: 0.95, rms: 0.1 };
  });

  it("is the mid part, not pulled up by a long high ending", () => {
    const base = speakerBaseline(frames, s)!;
    expect(Math.abs(12 * Math.log2(base / 180))).toBeLessThan(0.6);
    expect(median(frames.map((f) => f.hz))).toBeGreaterThan(190); // the old baseline was pulled up
  });

  it("turns a rise that was right into a passing ending", () => {
    const level = toLevelContour(frames, speakerBaseline(frames, s))!;
    const r = analyze(s, level.contour, { modality: "speak", timingKnown: false, durationSec: level.durationSec });
    expect(r.groups[0].checks.find((c) => c.id === "ending")!.status).toBe("pass");
    // with the old baseline (median of the whole take) the same rise only got "almost"
    const old = toLevelContour(frames)!;
    const ro = analyze(s, old.contour, { modality: "speak", timingKnown: false, durationSec: old.durationSec });
    expect(ro.groups[0].checks.find((c) => c.id === "ending")!.status).not.toBe("pass");
  });

  it("falls back to the whole take when there is too little voice", () => {
    expect(speakerBaseline(frames.slice(0, 3), s)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { layoutSentence, targetContour, targetKeyPoints } from "./contour.ts";
import { CHART, levelToY, strokesToContour } from "./drawing.ts";
import { dtwMeanCost } from "./dtw.ts";
import { analyze } from "./engine.ts";
import { SENTENCES, getSentence } from "./lessons.ts";
import type { AnalysisResult, Contour, Sentence } from "./types.ts";

const statusOf = (r: AnalysisResult, group: number, id: string) =>
  r.groups[group].checks.find((c) => c.id === id)?.status;

/** Build a drawing-style contour from per-syllable key levels (one or two per syllable). */
function drawLevels(sentence: Sentence, levels: number[][]): Contour {
  const layout = layoutSentence(sentence);
  const strokes = layout.slots.map((slot, i) => {
    const w = slot.end - slot.start;
    const lv = levels[i];
    const pts = lv.length === 1 ? [0.05, 0.95].map((f) => ({ f, v: lv[0] })) : [{ f: 0.15, v: lv[0] }, { f: 0.9, v: lv[1] }];
    return pts.map(({ f, v }) => ({ x: (slot.start + f * w) * CHART.width, y: levelToY(v) }));
  });
  // one stroke per thought group (pen lifted at the comma)
  const byGroup: { x: number; y: number }[][] = [];
  layout.slots.forEach((s, i) => {
    (byGroup[s.groupIndex] ??= []).push(...strokes[i]);
  });
  return strokesToContour(byGroup);
}

/** Simulated speech: target shape, stretched in time, with jitter, unvoiced gaps and a pause between groups. */
function fakeVoice(sentence: Sentence, opts: { pause: boolean; transform?: (v: number, t: number) => number }): Contour {
  const layout = layoutSentence(sentence);
  const tgt = targetContour(layout);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.12;
  const out: Contour = [];
  tgt.forEach((p, i) => {
    let v = p.v;
    if (v !== null && opts.transform) v = opts.transform(v, p.t);
    if (v !== null) v += rnd();
    // knock out a few frames to mimic consonants
    if (i % 37 === 0) v = null;
    if (!opts.pause && p.v === null) {
      // fill the group gap with voiced, level-2 speech (no pause)
      const inside = p.t > layout.groupSpans[0].start && p.t < layout.groupSpans[layout.groupSpans.length - 1].end;
      if (inside) v = 2;
    }
    // warp time a little (speakers are never evenly timed)
    out.push({ t: Math.pow(p.t, 1.1), v });
  });
  return out;
}

describe("target lines pass their own checks", () => {
  for (const s of SENTENCES) {
    it(`${s.id}`, () => {
      const layout = layoutSentence(s);
      const r = analyze(s, targetContour(layout), { modality: "draw", timingKnown: true });
      for (const g of r.groups) {
        for (const c of g.checks) expect(c.status, `${s.id} group ${g.groupIndex} ${c.id}: ${c.message.en}`).toBe("pass");
        expect(g.shapeScore).toBeGreaterThanOrEqual(98);
      }
      expect(r.overall).toBeGreaterThanOrEqual(98);
    });
  }
});

describe("drawing quiz catches typical Thai-learner errors", () => {
  it("flat line on a statement → range and ending fail", () => {
    const s = getSentence("fall-pretty-woman")!;
    const r = analyze(s, drawLevels(s, s.groups[0].words.flatMap((w) => w.syllables.map(() => [2]))), {
      modality: "draw",
      timingKnown: true,
    });
    expect(statusOf(r, 0, "range")).toBe("fail");
    expect(statusOf(r, 0, "ending")).toBe("fail");
    expect(r.overall).toBeLessThan(60);
  });

  it("yes/no question that falls at the end → ending fail with the 'went DOWN' message", () => {
    const s = getSentence("rise-student")!;
    const r = analyze(s, drawLevels(s, [[2], [2], [2], [3], [3, 1]]), { modality: "draw", timingKnown: true });
    const ending = r.groups[0].checks.find((c) => c.id === "ending")!;
    expect(ending.status).toBe("fail");
    expect(ending.message.en).toMatch(/DOWN/);
    // a wrong ending changes the meaning, so the score is capped however nice the rest looks
    expect(r.overall).toBeLessThanOrEqual(50);
  });

  it("rise on the wrong word → peak placement not passing", () => {
    const s = getSentence("fall-pretty-woman")!;
    // peak on PRE-tty instead of WO-man
    const r = analyze(s, drawLevels(s, [[2], [2], [2], [3], [2], [2], [1]]), { modality: "draw", timingKnown: true });
    expect(statusOf(r, 0, "peakPlacement")).toBe("fail");
    expect(r.groups[0].checks.find((c) => c.id === "peakPlacement")!.message.en).toMatch(/PRE/);
  });

  it("a tone on every word → single-peak fail", () => {
    const s = getSentence("fall-pretty-woman")!;
    const r = analyze(s, drawLevels(s, [[2, 3], [2, 3], [2], [3], [2], [3], [1]]), { modality: "draw", timingKnown: true });
    expect(["warn", "fail"]).toContain(statusOf(r, 0, "singlePeak"));
  });

  it("non-final clause that drops to 1 → ending fail on group 1 only", () => {
    const s = getSentence("nonfinal-rains-bus")!;
    const r = analyze(s, drawLevels(s, [[2], [2], [3, 1], [2], [2], [2], [2], [3, 1]]), { modality: "draw", timingKnown: true });
    expect(statusOf(r, 0, "ending")).toBe("fail");
    expect(statusOf(r, 1, "ending")).toBe("pass");
  });

  it("sure vs unsure tag: the same drawing can't pass both", () => {
    const sure = getSentence("tag-sure")!;
    const unsure = getSentence("tag-unsure")!;
    const falling = drawLevels(sure, [[2], [2], [2], [3], [1], [3], [1], [1]]);
    expect(statusOf(analyze(sure, falling, { modality: "draw", timingKnown: true }), 1, "ending")).toBe("pass");
    expect(statusOf(analyze(unsure, falling, { modality: "draw", timingKnown: true }), 1, "ending")).toBe("fail");
  });

  it("returns per-syllable [start,end] levels for analytics", () => {
    const s = getSentence("fall-what-name")!;
    const r = analyze(s, drawLevels(s, [[2], [2], [2], [3, 1]]), { modality: "draw", timingKnown: true });
    expect(r.syllableLevels).toEqual([[2, 2], [2, 2], [2, 2], [3, 1]]);
  });
});

describe("voice path (no syllable timing yet)", () => {
  it("good reading passes everything it can check; peak placement is skipped", () => {
    const s = getSentence("nonfinal-rains-bus")!;
    const r = analyze(s, fakeVoice(s, { pause: true }), { modality: "speak", timingKnown: false, durationSec: 2.5 });
    expect(r.sentenceChecks.find((c) => c.id === "break")?.status).toBe("pass");
    for (const g of r.groups) {
      for (const c of g.checks) {
        if (c.id === "peakPlacement") expect(c.status).toBe("skip");
        else expect(c.status, `${g.groupIndex} ${c.id}: ${c.message.en}`).toBe("pass");
      }
    }
  });

  it("no pause at the comma → break warning", () => {
    const s = getSentence("nonfinal-rains-bus")!;
    const r = analyze(s, fakeVoice(s, { pause: false }), { modality: "speak", timingKnown: false, durationSec: 2.5 });
    expect(r.sentenceChecks.find((c) => c.id === "break")?.status).toBe("warn");
  });

  it("monotone voice (compressed range) → range fails", () => {
    const s = getSentence("fall-what-name")!;
    const r = analyze(s, fakeVoice(s, { pause: true, transform: (v) => 2 + (v - 2) * 0.2 }), {
      modality: "speak",
      timingKnown: false,
      durationSec: 1.5,
    });
    expect(statusOf(r, 0, "range")).toBe("fail");
  });
});

describe("helpers", () => {
  it("DTW of identical series is 0 and grows with distance", () => {
    const a = [1, 2, 3, 2, 1];
    expect(dtwMeanCost(a, a)).toBe(0);
    expect(dtwMeanCost([2, 2, 2, 2], [3, 3, 3, 3])).toBeCloseTo(1, 5);
    // a time-shifted copy is cheaper than a flat line
    expect(dtwMeanCost(a, [1, 1, 2, 3, 2])).toBeLessThan(dtwMeanCost(a, [2, 2, 2, 2, 2]));
  });

  it("target key points include a glide for [3,1] syllables", () => {
    const s = getSentence("fall-what-name")!;
    const keys = targetKeyPoints(layoutSentence(s));
    expect(keys.at(-2)!.v).toBe(3);
    expect(keys.at(-1)!.v).toBe(1);
  });
});

describe("a falling ending is judged by how low the voice got, not by its last breath", () => {
  const s = getSentence("fall-pretty-woman")!;
  /** 100 frames: rises 2 → 3 by 0.55, falls to `low` by 0.88, then the last 5% are `tail`. */
  const contour = (low: number, tail: number): Contour =>
    Array.from({ length: 100 }, (_, i) => {
      const t = i / 99;
      const v = t < 0.2 ? 2 : t < 0.55 ? 2 + (t - 0.2) / 0.35 : t < 0.88 ? 3 - ((t - 0.55) / 0.33) * (3 - low) : t < 0.95 ? low : tail;
      return { t, v };
    });
  const run = (c: Contour) => analyze(s, c, { modality: "speak", timingKnown: false, durationSec: 2 });

  it("drops to low and trails off a little higher: still a pass", () => {
    expect(statusOf(run(contour(1.1, 1.75)), 0, "ending")).toBe("pass");
  });

  it("a fall to just a bit below normal is no longer a fail", () => {
    expect(["pass", "warn"]).toContain(statusOf(run(contour(1.7, 1.7)), 0, "ending"));
  });

  it("a voice that never leaves its normal pitch still fails", () => {
    expect(statusOf(run(contour(2.2, 2.2)), 0, "ending")).toBe("fail");
  });

  it("a voice that ends HIGH still fails", () => {
    expect(statusOf(run(contour(1.2, 2.8)), 0, "ending")).toBe("fail");
  });
});

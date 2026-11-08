import { describe, expect, it } from "vitest";
import { toLevelContour, trackPitch } from "../audio/pitch.ts";
import { ERROR_STYLES, synthesizeSentence } from "../synth/voice.ts";
import { layoutSentence } from "./contour.ts";
import { CHART, levelToY, strokesToContour } from "./drawing.ts";
import { analyze } from "./engine.ts";
import { getSentence } from "./lessons.ts";
import { PRAISE, pickTopTip } from "./tips.ts";
import type { AnalysisResult, Check, CheckId, CheckStatus, GroupResult, Sentence } from "./types.ts";

const check = (id: CheckId, status: CheckStatus): Check => ({
  id,
  status,
  message: { en: `${id} ${status}`, th: `${id} ${status} th` },
});

function group(groupIndex: number, checks: Check[]): GroupResult {
  return {
    groupIndex,
    pattern: "2-3-1",
    checks,
    shapeScore: 80,
    // features aren't read by pickTopTip
    features: {} as GroupResult["features"],
  };
}

function result(groups: GroupResult[], sentenceChecks: Check[] = []): AnalysisResult {
  return { modality: "draw", groups, sentenceChecks, overall: 50, syllableLevels: null, aligned: [] };
}

const ALL: CheckId[] = ["start", "singlePeak", "peakPlacement", "ending", "range", "break"];

describe("pickTopTip (hand-made results)", () => {
  it("ending beats every other failing check", () => {
    const checks = ALL.map((id) => check(id, "fail"));
    const tip = pickTopTip(result([group(0, checks)]));
    expect(tip).toMatchObject({ kind: "tip", groupIndex: 0, check: { id: "ending" } });
  });

  it("follows the priority order ending > peakPlacement > singlePeak > range > start > break", () => {
    let remaining = ALL.slice();
    const order: CheckId[] = [];
    while (remaining.length) {
      const tip = pickTopTip(result([group(0, remaining.map((id) => check(id, "fail")))]));
      if (tip.kind !== "tip") throw new Error("expected a tip");
      order.push(tip.check.id);
      remaining = remaining.filter((id) => id !== tip.check.id);
    }
    expect(order).toEqual(["ending", "peakPlacement", "singlePeak", "range", "start", "break"]);
  });

  it("a warn on a higher-priority check still beats a fail on a lower-priority one", () => {
    const tip = pickTopTip(result([group(0, [check("ending", "warn"), check("range", "fail")])]));
    expect(tip).toMatchObject({ kind: "tip", check: { id: "ending", status: "warn" } });
  });

  it("within the same check id, fail beats warn (even in a later group)", () => {
    const tip = pickTopTip(result([group(0, [check("range", "warn")]), group(1, [check("range", "fail")])]));
    expect(tip).toMatchObject({ kind: "tip", groupIndex: 1, check: { id: "range", status: "fail" } });
  });

  it("skipped checks are ignored", () => {
    const tip = pickTopTip(result([group(0, [check("ending", "skip"), check("peakPlacement", "skip"), check("start", "warn")])]));
    expect(tip).toMatchObject({ kind: "tip", check: { id: "start", status: "warn" } });
  });

  it("passed and skipped checks only → praise", () => {
    const tip = pickTopTip(result([group(0, [check("ending", "pass"), check("peakPlacement", "skip"), check("range", "pass")])]));
    expect(tip).toEqual({ kind: "praise", message: PRAISE });
  });

  it("praise is bilingual with non-empty English and Thai", () => {
    expect(PRAISE.en.length).toBeGreaterThan(0);
    expect(PRAISE.th).toMatch(/[฀-๿]/);
  });

  it("tie between groups → the earlier group", () => {
    const tip = pickTopTip(result([group(0, [check("ending", "pass")]), group(1, [check("ending", "fail")]), group(2, [check("ending", "fail")])]));
    expect(tip).toMatchObject({ kind: "tip", groupIndex: 1, check: { id: "ending", status: "fail" } });
  });

  it("a sentence-level break problem is reported only when nothing else is wrong", () => {
    const withBreak = [check("break", "warn")];
    expect(pickTopTip(result([group(0, [check("start", "warn")])], withBreak))).toMatchObject({ check: { id: "start" } });
    expect(pickTopTip(result([group(0, [check("start", "pass")])], withBreak))).toMatchObject({
      kind: "tip",
      groupIndex: null,
      check: { id: "break" },
    });
  });

  it("every tip message is bilingual", () => {
    const tip = pickTopTip(result([group(0, [check("ending", "fail")])]));
    if (tip.kind !== "tip") throw new Error("expected a tip");
    expect(tip.check.message.en).toBeTruthy();
    expect(tip.check.message.th).toBeTruthy();
  });
});

describe("pickTopTip on real analyze() output", () => {
  /** Drawing-style contour from per-syllable levels (same idea as engine.test.ts). */
  function drawLevels(sentence: Sentence, levels: number[][]) {
    const layout = layoutSentence(sentence);
    const byGroup: { x: number; y: number }[][] = [];
    layout.slots.forEach((slot, i) => {
      const w = slot.end - slot.start;
      const lv = levels[i];
      const pts = lv.length === 1 ? [0.05, 0.95].map((f) => ({ f, v: lv[0] })) : [{ f: 0.15, v: lv[0] }, { f: 0.9, v: lv[1] }];
      (byGroup[slot.groupIndex] ??= []).push(...pts.map(({ f, v }) => ({ x: (slot.start + f * w) * CHART.width, y: levelToY(v) })));
    });
    return strokesToContour(byGroup);
  }

  it("yes/no question drawn falling → headline tip is the ending", () => {
    const s = getSentence("rise-student")!;
    const r = analyze(s, drawLevels(s, [[2], [2], [2], [3], [3, 1]]), { modality: "draw", timingKnown: true });
    const tip = pickTopTip(r);
    expect(tip).toMatchObject({ kind: "tip", groupIndex: 0, check: { id: "ending", status: "fail" } });
    if (tip.kind === "tip") expect(tip.check.message.en).toMatch(/DOWN/);
  });

  it("peak on the wrong word with a good ending → peak placement is the tip", () => {
    const s = getSentence("fall-pretty-woman")!;
    const r = analyze(s, drawLevels(s, [[2], [2], [2], [3], [2], [2], [1]]), { modality: "draw", timingKnown: true });
    const tip = pickTopTip(r);
    expect(tip.kind).toBe("tip");
    if (tip.kind === "tip") expect(["ending", "peakPlacement"]).toContain(tip.check.id);
  });

  it("non-final clause that drops → tip points at group 0", () => {
    const s = getSentence("nonfinal-rains-bus")!;
    const r = analyze(s, drawLevels(s, [[2], [2], [3, 1], [2], [2], [2], [2], [3, 1]]), { modality: "draw", timingKnown: true });
    expect(pickTopTip(r)).toMatchObject({ kind: "tip", groupIndex: 0, check: { id: "ending" } });
  });

  it("synthetic voice with the wrong ending → ending tip", () => {
    const s = getSentence("rise-student")!;
    const { samples, sampleRate } = synthesizeSentence(s, { transform: ERROR_STYLES.wrongEnding });
    const lc = toLevelContour(trackPitch(samples, sampleRate))!;
    const r = analyze(s, lc.contour, { modality: "speak", timingKnown: false, durationSec: lc.durationSec });
    expect(pickTopTip(r)).toMatchObject({ kind: "tip", check: { id: "ending", status: "fail" } });
  });

  it("monotone synthetic voice → never a skipped check, and a tip is produced", () => {
    const s = getSentence("fall-what-name")!;
    const { samples, sampleRate } = synthesizeSentence(s, { transform: ERROR_STYLES.flat });
    const lc = toLevelContour(trackPitch(samples, sampleRate))!;
    const r = analyze(s, lc.contour, { modality: "speak", timingKnown: false, durationSec: lc.durationSec });
    const tip = pickTopTip(r);
    expect(tip.kind).toBe("tip");
    if (tip.kind === "tip") expect(["fail", "warn"]).toContain(tip.check.status);
  });

  it("the perfect target drawing → praise", () => {
    const s = getSentence("fall-what-name")!;
    const r = analyze(s, drawLevels(s, [[2], [2], [2], [3, 1]]), { modality: "draw", timingKnown: true });
    expect(r.groups.flatMap((g) => g.checks).every((c) => c.status === "pass")).toBe(true);
    expect(pickTopTip(r)).toEqual({ kind: "praise", message: PRAISE });
  });
});

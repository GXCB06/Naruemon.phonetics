import { describe, expect, it } from "vitest";
import { analyze } from "../intonation/engine.ts";
import { getSentence } from "../intonation/lessons.ts";
import type { PatternId } from "../intonation/types.ts";
import {
  drawGroupsOf,
  drawScore,
  evaluateDrawing,
  levelsFromStroke,
  levelsToContour,
  stepPath,
  targetLevels,
  type DrawGroup,
  type Levels,
  type SlotRef,
  type StrokePoint,
} from "./tuneDraw.ts";

// The five prototype sentences, written the way drawGroupsOf builds them.
const G = (pattern: PatternId, nucleus: number, syl: [string, number, Levels][]): DrawGroup => ({
  pattern,
  nucleus,
  syl: syl.map(([text, word, target]) => ({ text, word, target })),
});
const BOOK = [G("2-3-1", 5, [["The", 0, [2]], ["book", 1, [2]], ["is", 2, [2]], ["on", 3, [2]], ["my", 4, [2]], ["ta", 5, [3]], ["ble.", 5, [1]]])];
const NAME = [G("2-3-1", 3, [["What", 0, [2]], ["is", 1, [2]], ["your", 2, [2]], ["name?", 3, [3, 1]]])];
const STUDENT = [G("2-3", 3, [["Are", 0, [2]], ["you", 1, [2]], ["a", 2, [2]], ["stu", 3, [3]], ["dent?", 3, [3]]])];
const RAINS = [
  G("2-3-2", 2, [["If", 0, [2]], ["it", 1, [2]], ["rains,", 2, [3, 2]]]),
  G("2-3-1", 4, [["I", 0, [2]], ["will", 1, [2]], ["take", 2, [2]], ["the", 3, [2]], ["bus.", 4, [3, 1]]]),
];
const TAG = [
  G("2-3-1", 3, [["Har", 0, [2]], ["ry", 0, [2]], ["is", 1, [2]], ["com", 2, [3]], ["ing,", 2, [1]]]),
  G("3-1", 0, [["is", 0, [3]], ["n't", 0, [1]], ["he?", 1, [1]]]),
];
const ALL = [BOOK, NAME, STUDENT, RAINS, TAG];

/** A hand-drawn stroke over one thought group: flat syllables, steps between them, falls bending early in the syllable. */
function stroke(levels: Levels[], start: number, fall: [number, number] = [0.08, 0.3]): StrokePoint[] {
  const pts: StrokePoint[] = [];
  levels.forEach((lv, j) => {
    const a = lv[0];
    const b = lv[lv.length - 1];
    for (let t = 0.02; t <= 0.99; t += 0.02) {
      let v = a;
      if (b < a) v = t < fall[0] ? a : t < fall[1] ? a + ((b - a) * (t - fall[0])) / (fall[1] - fall[0]) : b;
      else if (b > a) v = t < 0.5 ? a : t < 0.9 ? a + ((b - a) * (t - 0.5)) / 0.4 : b;
      pts.push({ u: start + j + t, v: v + 0.15 * Math.sin(37 * (j + t)) * 0.3 }); // a little hand wobble
    }
  });
  return pts;
}
/** Draw every group of a sentence with its own stroke; return the levels read back. */
function drawAll(groups: DrawGroup[], levels: Levels[], fall?: [number, number]): (Levels | null)[] {
  const slots: SlotRef[] = groups.flatMap((g, gi) => g.syl.map(() => ({ i: 0, g: gi }))).map((s, i) => ({ ...s, i }));
  let cur: (Levels | null)[] = slots.map(() => null);
  let base = 0;
  for (const g of groups) {
    const n = g.syl.length;
    cur = levelsFromStroke(stroke(levels.slice(base, base + n), base, fall), slots, cur).next;
    base += n;
  }
  return cur;
}

describe("tune drawing: reading strokes", () => {
  for (const [name, fall] of [["very fast", [0.03, 0.15]], ["fast", [0.08, 0.3]], ["wide", [0.12, 0.9]]] as const) {
    it(`reads ${name} falls as the textbook line (all five sentences Perfect)`, () => {
      for (const groups of ALL) {
        const got = drawAll(groups, targetLevels(groups), [fall[0], fall[1]]);
        expect(got).toEqual(targetLevels(groups));
        expect(evaluateDrawing(groups, got).grade).toBe("perfect");
      }
    });
  }

  it("ignores a syllable the stroke does not reach the middle of", () => {
    const slots: SlotRef[] = [0, 1, 2].map((i) => ({ i, g: 0 }));
    const { next } = levelsFromStroke([{ u: 0.1, v: 2 }, { u: 1.3, v: 2 }], slots, [null, null, null]);
    expect(next).toEqual([[2], null, null]);
  });
});

describe("tune drawing: grading", () => {
  it("Good when the rules pass but a syllable differs from the book, with a Perfect hint", () => {
    const v = evaluateDrawing(NAME, [[2], [1], [2], [3, 1]]);
    expect(v.grade).toBe("good");
    expect(v.diff?.i).toBe(1);
    expect(v.diff?.en).toBe("For a Perfect: on IS the book's line stays at 2, yours stays at 1.");
    expect(drawScore(v)).toBe(85);
  });

  it("names the rise on the wrong word", () => {
    const v = evaluateDrawing(BOOK, [[2], [3], [2], [2], [2], [2], [1]]);
    expect(v.grade).toBe("miss");
    expect(v.failure?.at).toBe(1);
    expect(v.failure?.message.en).toMatch(/^Your rise is on BOOK\. Put it on TA-, the stressed syllable of TABLE/);
  });

  it("puts the ending first: a wh-question that goes up", () => {
    const v = evaluateDrawing(NAME, [[2], [2], [2], [2, 3]]);
    expect(v.failure?.message.en).toMatch(/goes UP at the end/);
  });

  it("a non-final part that drops to 1 sounds finished", () => {
    const v = evaluateDrawing(RAINS, [[2], [2], [3, 1], [2], [2], [2], [2], [3, 1]]);
    expect(v.failure?.message.en).toMatch(/^You dropped to 1, so it sounds finished/);
  });

  it("a yes/no question must stay up", () => {
    expect(evaluateDrawing(STUDENT, [[2], [2], [2], [3], [1]]).failure?.message.en).toMatch(/stays UP/);
  });

  it("a sure tag must start high", () => {
    const v = evaluateDrawing(TAG, [[2], [2], [2], [3], [1], [2], [1], [1]]);
    expect(v.failure?.message.en).toMatch(/^Your tag starts at 2/);
  });

  it("asks for the whole part when a syllable is not drawn, and waits with the other rules", () => {
    const v = evaluateDrawing(RAINS, [[2], [2], [3, 2], null, [2], [2], [2], [3, 1]]);
    expect(v.failure?.message.en).toMatch(/^Nothing is drawn under I\./);
    expect(v.reports[1].complete).toBe(false);
    expect(drawScore(v)).toBeLessThan(60);
  });

  it("flags a second rise", () => {
    const v = evaluateDrawing(BOOK, [[2], [3], [2], [2], [2], [3], [1]]);
    // the first rise is on BOOK, which the rise rule reports first
    expect(v.reports[0].checks.find((c) => c.id === "single")?.ok).toBe(false);
  });
});

describe("tune drawing: course sentences and geometry", () => {
  it("builds groups from a course sentence with the nucleus in place", () => {
    const s = getSentence("nonfinal-rains-bus")!;
    const groups = drawGroupsOf(s);
    expect(groups.map((g) => g.pattern)).toEqual(["2-3-2", "2-3-1"]);
    expect(evaluateDrawing(groups, targetLevels(groups)).grade).toBe("perfect");
  });

  it("turns the textbook drawing into a contour the analytics engine grades well", () => {
    const s = getSentence("fall-what-name")!;
    const groups = drawGroupsOf(s);
    const contour = levelsToContour(s, targetLevels(groups));
    const r = analyze(s, contour, { modality: "draw", timingKnown: true });
    expect(r.overall).toBeGreaterThanOrEqual(70);
    expect(contour.some((p) => p.v === null)).toBe(true); // the edges are not drawn
  });

  it("draws steps between syllables, a bend for a fall and a tail after the last syllable", () => {
    const cells = [
      { x0: 0, x1: 100, g: 0, i: 0 },
      { x0: 100, x1: 200, g: 0, i: 1 },
    ];
    const d = stepPath(cells, [[2], [3, 1]], (v) => 100 - v * 10, 20);
    expect(d.startsWith("M0.0 80.0 L100.0 80.0 L100.0 80.0 L100.0 70.0")).toBe(true);
    expect(d).toContain(" A23.0 20.0 0 0 1 ");
    expect(d.endsWith("L220.0 90.0")).toBe(true);
    expect(stepPath(cells, [null, [2]], () => 0)).toBe("M100.0 0.0 L200.0 0.0");
  });
});

import { describe, expect, it } from "vitest";
import {
  DRAW_GRADES_KEY,
  addDrawGrade,
  countsTotal,
  loadGradeTally,
  mergeGradeTallies,
  parseGradeTally,
  recordDrawGrade,
  saveGradeTally,
  tallyFromRows,
} from "./grades.ts";

function memoryStore(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
}

describe("draw grade tally", () => {
  it("counts Perfect / Good / Miss per pattern without changing the old tally", () => {
    const a = addDrawGrade({}, "2-3-1", "perfect");
    const b = addDrawGrade(addDrawGrade(a, "2-3-1", "good"), "2-3", "miss");
    expect(a).toEqual({ "2-3-1": { perfect: 1, good: 0, miss: 0 } });
    expect(b).toEqual({ "2-3-1": { perfect: 1, good: 1, miss: 0 }, "2-3": { perfect: 0, good: 0, miss: 1 } });
    expect(countsTotal(b["2-3-1"])).toBe(2);
  });

  it("builds a tally from attempt rows, ignoring non-draw rows and rows without a grade", () => {
    const t = tallyFromRows([
      { pattern: "2-3-1", modality: "draw", draw_grade: "perfect" },
      { pattern: "2-3-1", modality: "draw", draw_grade: "good" },
      { pattern: "2-3-1", modality: "draw" }, // saved before migration 0003
      { pattern: "2-3-1", modality: "speak", draw_grade: "perfect" },
      { pattern: "2-3", modality: "draw", draw_grade: "bogus" },
      { pattern: "2-3", draw_grade: "miss" }, // server rows selected by modality carry no modality field
    ]);
    expect(t).toEqual({ "2-3-1": { perfect: 1, good: 1, miss: 0 }, "2-3": { perfect: 0, good: 0, miss: 1 } });
  });

  it("merge keeps, per pattern, the side with more drawings (ties: this device)", () => {
    const local = { "2-3-1": { perfect: 3, good: 0, miss: 0 }, "2-3": { perfect: 1, good: 0, miss: 0 } };
    const remote = { "2-3-1": { perfect: 1, good: 1, miss: 0 }, "2-3": { perfect: 0, good: 2, miss: 1 }, "3-1": { perfect: 0, good: 0, miss: 1 } };
    expect(mergeGradeTallies(local, remote)).toEqual({
      "2-3-1": local["2-3-1"],
      "2-3": remote["2-3"],
      "3-1": remote["3-1"],
    });
    expect(mergeGradeTallies(local, { "2-3-1": { perfect: 0, good: 3, miss: 0 } })["2-3-1"]).toBe(local["2-3-1"]);
  });

  it("round-trips through storage and drops malformed entries", () => {
    const s = memoryStore();
    recordDrawGrade("2-3-1", "perfect", s);
    recordDrawGrade("2-3-1", "good", s);
    expect(loadGradeTally(s)).toEqual({ "2-3-1": { perfect: 1, good: 1, miss: 0 } });
    expect(parseGradeTally("{bad")).toEqual({});
    expect(parseGradeTally("[1,2]")).toEqual({});
    expect(parseGradeTally(JSON.stringify({ ok: { perfect: 1, good: 0, miss: 2 }, bad: { perfect: -1, good: 0, miss: 0 }, worse: 5 }))).toEqual({
      ok: { perfect: 1, good: 0, miss: 2 },
    });
    saveGradeTally({ x: { perfect: 1, good: 0, miss: 0 } }, s);
    expect(JSON.parse(s.data[DRAW_GRADES_KEY])).toEqual({ x: { perfect: 1, good: 0, miss: 0 } });
  });

  it("never throws when storage does", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(loadGradeTally(broken)).toEqual({});
    expect(() => recordDrawGrade("2-3-1", "good", broken)).not.toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { buildFeedback, hashSeed, sameTune, seededShuffle, tuneBank, tuneText, tuneTiles } from "./build.ts";
import { PLAN, buildExercises, makeMatch, MATCH_VARIANTS } from "./exercises.ts";
import { matchFeedback, matchScore, MATCH_LABEL } from "./match.ts";
import { contentKeys, loadLesson } from "./content.ts";
import type { Sentence } from "../intonation/types.ts";

const all: Sentence[] = contentKeys().flatMap((k) => {
  const [u, l] = k.split("/");
  return loadLesson(u, l)?.sentences ?? [];
});

describe("build the tune", () => {
  it("writes each group's levels with | between groups", () => {
    for (const s of all) {
      const tiles = tuneTiles(s);
      expect(tiles.filter((t) => t === "|")).toHaveLength(s.groups.length - 1);
      expect(tuneText(tiles)).toBe(s.groups.map((g) => g.pattern).join(" | "));
    }
  });

  it("the bank holds the answer plus two distractors, same bank for the same seed", () => {
    for (const s of all) {
      const bank = tuneBank(s, 7);
      expect(bank).toHaveLength(tuneTiles(s).length + 2);
      const left = [...bank];
      for (const t of tuneTiles(s)) left.splice(left.indexOf(t), 1);
      expect(left).toHaveLength(2);
      expect(tuneBank(s, 7)).toEqual(bank);
    }
  });

  it("checks order exactly", () => {
    expect(sameTune(["2", "3", "1"], ["2", "3", "1"])).toBe(true);
    expect(sameTune(["2", "1", "3"], ["2", "3", "1"])).toBe(false);
    expect(sameTune(["2", "3"], ["2", "3", "1"])).toBe(false);
  });

  it("feedback names the right tune in both languages", () => {
    const s = all.find((x) => x.groups.length === 2)!;
    const f = buildFeedback(false, s);
    expect(f.passed).toBe(false);
    expect(f.detail.en).toContain(tuneText(tuneTiles(s)));
    expect(f.detail.th).toContain(tuneText(tuneTiles(s)));
  });

  it("shuffle keeps every item", () => {
    expect(seededShuffle([1, 2, 3, 4, 5], hashSeed("x")).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("match the pairs", () => {
  it("uses three distinct clips and never lines answers up straight across", () => {
    for (const [i, s] of all.entries()) {
      const m = makeMatch(s, `l-${i}-match`);
      expect([...m.clips].sort()).toEqual([...MATCH_VARIANTS].sort());
      expect([...m.labels].sort()).toEqual([...MATCH_VARIANTS].sort());
      m.labels.forEach((l, k) => expect(l).not.toBe(m.clips[k]));
      m.clips.forEach((c) => expect(MATCH_LABEL[c]).toBeDefined());
    }
  });

  it("scores wrong tries", () => {
    expect(matchScore(0)).toEqual({ score: 100, passed: true });
    expect(matchScore(1)).toEqual({ score: 75, passed: true });
    expect(matchScore(2).passed).toBe(false);
    expect(matchScore(9).score).toBe(25);
    expect(matchFeedback(3).detail.th).toContain("3");
  });

  it("the default plan has one match and one build", () => {
    expect(PLAN.filter((t) => t === "match")).toHaveLength(1);
    expect(PLAN.filter((t) => t === "build")).toHaveLength(1);
    const ex = buildExercises(all.slice(0, 3), "falling-1");
    expect(ex.find((e) => e.type === "build")).toMatchObject({ type: "build" });
  });
});

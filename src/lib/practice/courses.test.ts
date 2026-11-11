import { describe, expect, it } from "vitest";
import { allSentences } from "../learn/content.ts";
import { COURSES, DRILL_PLAN, buildDrill, courseById, courseSentences, courseStat, courseStatus, daysSince, drillId } from "./courses.ts";

const all = allSentences();

describe("practice courses", () => {
  it("every course has enough sentences for a 10-question drill without leaning on repeats", () => {
    for (const c of COURSES) expect(courseSentences(c.id, all).length, c.id).toBeGreaterThanOrEqual(5);
  });

  it("each course holds only the sentences it promises", () => {
    for (const s of courseSentences("falling", all)) expect(s.groups.length === 1 && s.groups[0].pattern === "2-3-1").toBe(true);
    for (const s of courseSentences("rising", all)) expect(s.groups.every((g) => g.pattern === "2-3")).toBe(true);
    for (const s of courseSentences("nonfinal", all)) expect(s.groups.some((g) => g.pattern === "2-3-2")).toBe(true);
    for (const s of courseSentences("tags", all)) expect(s.kind.startsWith("Tag question")).toBe(true);
    for (const s of courseSentences("class2", all)) expect(s.id.startsWith("class2-")).toBe(true);
    expect(courseSentences("class2", all)).toHaveLength(25);
    expect(courseSentences("random", all)).toHaveLength(all.length);
  });

  it("lists and rising never share a sentence (a choice question is a list, not a yes/no)", () => {
    const lists = new Set(courseSentences("lists", all).map((s) => s.id));
    for (const s of courseSentences("rising", all)) expect(lists.has(s.id)).toBe(false);
  });

  it("knows every course id and nothing else", () => {
    expect(courseById("falling")?.badge).toBe("2-3-1");
    expect(courseById("nope")).toBeUndefined();
    expect(new Set(COURSES.map((c) => c.id)).size).toBe(COURSES.length);
  });
});

describe("drills", () => {
  it("has 10 questions in the fixed plan, with unique ids and a sentence for each", () => {
    for (const c of COURSES) {
      const d = buildDrill(c.id, 7, all);
      expect(d.exercises.map((e) => e.type)).toEqual([...DRILL_PLAN]);
      expect(new Set(d.exercises.map((e) => e.id)).size).toBe(10);
      for (const e of d.exercises) expect(d.sentences.some((s) => s.id === e.sentenceId)).toBe(true);
      expect(d.id).toBe(drillId(c.id));
    }
  });

  it("is mostly drawing", () => {
    expect(DRILL_PLAN.filter((t) => t === "draw").length).toBeGreaterThanOrEqual(6);
  });

  it("is the same for the same seed and different for another", () => {
    const a = buildDrill("falling", 1, all).exercises.map((e) => e.sentenceId);
    expect(buildDrill("falling", 1, all).exercises.map((e) => e.sentenceId)).toEqual(a);
    const others = [2, 3, 4, 5, 6].map((s) => buildDrill("falling", s, all).exercises.map((e) => e.sentenceId).join());
    expect(others.some((o) => o !== a.join())).toBe(true);
  });

  it("never repeats a sentence back to back, and uses 10 different ones when the course is big enough", () => {
    for (const c of COURSES) {
      const ids = buildDrill(c.id, 3, all).exercises.map((e) => e.sentenceId);
      ids.forEach((id, i) => i > 0 && expect(id).not.toBe(ids[i - 1]));
      if (courseSentences(c.id, all).length >= 10) expect(new Set(ids).size).toBe(10);
    }
  });

  it("only uses sentences of its own course", () => {
    const pool = new Set(courseSentences("rising", all).map((s) => s.id));
    for (const s of buildDrill("rising", 9, all).sentences) expect(pool.has(s.id)).toBe(true);
  });

  it("gives an empty drill for an empty pool", () => {
    expect(buildDrill("tags", 1, []).exercises).toEqual([]);
  });

  it("build questions carry a tile bank", () => {
    for (const e of buildDrill("falling", 1, all).exercises) if (e.type === "build") expect(e.bank.length).toBeGreaterThan(3);
  });
});

describe("course cards", () => {
  const lessons = { [drillId("falling")]: { stars: 2, best: 82, completedAt: "2026-11-09T10:00:00.000Z" }, [drillId("rising")]: { stars: 0, best: 40, completedAt: "2026-11-01T10:00:00.000Z" } };

  it("reads best score, stars and the last day for a practised course, nothing for a new one", () => {
    expect(courseStat("falling", all, lessons)).toMatchObject({ best: 82, stars: 2, lastAt: "2026-11-09T10:00:00.000Z" });
    expect(courseStat("tags", all, lessons)).toMatchObject({ best: null, stars: 0, lastAt: null });
    expect(courseStat("tags", all, lessons).size).toBeGreaterThan(0);
  });

  it("labels courses: new, needs work under 70, good, mastered from 90", () => {
    const stat = (best: number | null) => ({ best, stars: 0, lastAt: null, size: 5 });
    expect([null, 40, 69, 70, 89, 90, 100].map((b) => courseStatus(stat(b)))).toEqual(["new", "needs-work", "needs-work", "good", "good", "mastered", "mastered"]);
  });

  it("counts whole days, never negative, and reads bad dates as none", () => {
    const now = new Date(2026, 10, 11, 9, 0, 0);
    expect(daysSince("2026-11-11T08:00:00", now)).toBe(0);
    expect(daysSince("2026-11-09T23:00:00", now)).toBe(2);
    expect(daysSince("2027-01-01T00:00:00", now)).toBe(0);
    expect(daysSince(null, now)).toBeNull();
    expect(daysSince("nonsense", now)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { completeLesson, emptyProgress, loadProgress, saveProgress, starsFor, visibleStreak } from "./store.ts";

const at = (iso: string) => new Date(`${iso}T12:00:00`);

describe("progress store", () => {
  it("adds XP, stars and starts a streak", () => {
    const p = completeLesson(emptyProgress(), "falling-1", { score: 92, xp: 20 }, at("2026-11-10"));
    expect(p.xp).toBe(20);
    expect(p.streak).toBe(1);
    expect(p.lessons["falling-1"].stars).toBe(3);
  });

  it("streak grows on consecutive days, stays on the same day, resets after a gap", () => {
    let p = completeLesson(emptyProgress(), "a", { score: 80, xp: 10 }, at("2026-11-10"));
    p = completeLesson(p, "b", { score: 80, xp: 10 }, at("2026-11-10"));
    expect(p.streak).toBe(1);
    p = completeLesson(p, "c", { score: 80, xp: 10 }, at("2026-11-11"));
    expect(p.streak).toBe(2);
    p = completeLesson(p, "d", { score: 80, xp: 10 }, at("2026-11-14"));
    expect(p.streak).toBe(1);
  });

  it("keeps the best score and never lowers stars; month boundaries count as consecutive", () => {
    let p = completeLesson(emptyProgress(), "a", { score: 95, xp: 10 }, at("2026-10-31"));
    p = completeLesson(p, "a", { score: 40, xp: 5 }, at("2026-11-01"));
    expect(p.lessons.a.best).toBe(95);
    expect(p.lessons.a.stars).toBe(3);
    expect(p.streak).toBe(2);
  });

  it("a lapsed streak is not shown", () => {
    const p = completeLesson(emptyProgress(), "a", { score: 80, xp: 10 }, at("2026-11-10"));
    expect(visibleStreak(p, at("2026-11-11"))).toBe(1);
    expect(visibleStreak(p, at("2026-11-12"))).toBe(0);
  });

  it("stars thresholds", () => {
    expect([40, 55, 75, 90].map(starsFor)).toEqual([0, 1, 2, 3]);
  });

  it("saves and loads, and survives bad storage", () => {
    const mem: Record<string, string> = {};
    const storage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => void (mem[k] = v) };
    const p = completeLesson(emptyProgress(), "a", { score: 80, xp: 10 }, at("2026-11-10"));
    saveProgress(p, storage);
    expect(loadProgress(storage).xp).toBe(10);
    mem["myna.progress.v1"] = "{not json";
    expect(loadProgress(storage)).toEqual(emptyProgress());
  });
});

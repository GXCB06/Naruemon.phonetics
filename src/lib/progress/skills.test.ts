import { describe, expect, it } from "vitest";
import { skillKey, type MasteryMap } from "../mastery/mastery.ts";
import { RADAR_AXES, skillRadar, weakestAxis, weekActivity, weekSummary } from "./skills.ts";
import type { AttemptPoint, IpaProgress } from "./view.ts";

const entry = (score: number, attemptsN: number) => ({ score, attemptsN, lastSeen: "2026-11-10T10:00:00.000Z" });
const ipa = (attempts: number, rate: number) => ({ attempts, rate }) as IpaProgress;
const get = (mastery: MasteryMap, ipaP: IpaProgress | null = null) => Object.fromEntries(skillRadar(mastery, ipaP).map((a) => [a.id, a.value]));

describe("skills radar", () => {
  it("has the eight spokes in order, all null with no data", () => {
    const axes = skillRadar({}, null);
    expect(axes.map((a) => a.id)).toEqual(RADAR_AXES.map((a) => a.id));
    expect(axes.every((a) => a.value === null && a.n === 0)).toBe(true);
  });

  it("weights a pattern's skills by their attempts, across modalities", () => {
    const m: MasteryMap = {
      [skillKey("2-3-1", "ending", "draw")]: entry(100, 6),
      [skillKey("2-3-1", "range", "speak")]: entry(40, 2),
    };
    // (100*6 + 40*2) / 8 = 85
    expect(get(m)["falling"]).toBe(85);
  });

  it("feeds drawing, speaking and listening from every pattern", () => {
    const m: MasteryMap = {
      [skillKey("2-3-1", "ending", "draw")]: entry(90, 3),
      [skillKey("2-3", "ending", "draw")]: entry(60, 3),
      [skillKey("2-3", "listening", "listen")]: entry(80, 5),
    };
    const v = get(m);
    expect(v["drawing"]).toBe(75);
    expect(v["listening"]).toBe(80);
    expect(v["speaking"]).toBeNull();
  });

  it("shows a spoke only once it rests on 5 attempts", () => {
    const few: MasteryMap = { [skillKey("2-3-2", "ending", "draw")]: entry(100, 4) };
    expect(get(few)["nonfinal"]).toBeNull();
    const enough: MasteryMap = { [skillKey("2-3-2", "ending", "draw")]: entry(100, 5) };
    expect(get(enough)["nonfinal"]).toBe(100);
  });

  it("reads IPA from the share of good words, and ignores junk entries", () => {
    expect(get({}, ipa(10, 72))["ipa"]).toBe(72);
    expect(get({}, ipa(3, 90))["ipa"]).toBeNull();
    const junk = { "broken": entry(50, 9), [skillKey("2-3-1", "x", "draw")]: entry(Number.NaN, 9), [skillKey("9-9", "x", "draw")]: entry(10, 9) } as MasteryMap;
    expect(get(junk)["falling"]).toBeNull();
    expect(get(junk)["drawing"]).toBe(10); // the unknown pattern still counts as drawing practice
  });

  it("finds the weakest spoke that has data", () => {
    expect(weakestAxis(skillRadar({}, null))).toBeNull();
    const m: MasteryMap = { [skillKey("2-3-1", "ending", "draw")]: entry(90, 6), [skillKey("2-3", "ending", "draw")]: entry(30, 6) };
    expect(weakestAxis(skillRadar(m, null))?.id).toBe("rising");
  });
});

describe("the week", () => {
  const now = new Date(2026, 10, 11, 15, 0, 0); // Wed 11 Nov 2026, local
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).toISOString();
  const point = (iso: string, id: string): AttemptPoint => ({ id, at: iso, pattern: "2-3-1", modality: "draw", overall: 80 });

  it("lists the last 7 days oldest first, today last", () => {
    const days = weekActivity([], now);
    expect(days).toHaveLength(7);
    expect(days[0].day).toBe("2026-11-05");
    expect(days[6]).toMatchObject({ day: "2026-11-11", weekday: 3, isToday: true });
    expect(days.filter((d) => d.isToday)).toHaveLength(1);
  });

  it("counts attempts per day (every modality) and ignores older days and bad times", () => {
    const pts = [point(at(2026, 10, 11), "a"), point(at(2026, 10, 11, 8), "b"), point(at(2026, 10, 9), "c"), point(at(2026, 10, 1), "old"), point("nonsense", "bad")];
    const days = weekActivity(pts, now);
    expect(days.find((d) => d.day === "2026-11-11")!.count).toBe(2);
    expect(days.find((d) => d.day === "2026-11-09")!.count).toBe(1);
    expect(days.reduce((n, d) => n + d.count, 0)).toBe(3);
  });

  it("summarises total, active days and a max bars can divide by", () => {
    expect(weekSummary(weekActivity([], now))).toEqual({ total: 0, activeDays: 0, max: 1 });
    const s = weekSummary(weekActivity([point(at(2026, 10, 11), "a"), point(at(2026, 10, 11, 9), "b"), point(at(2026, 10, 10), "c")], now));
    expect(s).toEqual({ total: 3, activeDays: 2, max: 2 });
  });
});

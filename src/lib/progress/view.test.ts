import { describe, expect, it } from "vitest";
import type { QueuedAttempt } from "../attempts/queue.ts";
import type { UnitMeta } from "../course/units.ts";
import { skillKey, type MasteryMap } from "../mastery/mastery.ts";
import { gradeIpa, parseFocus, parseIpa, practiceWords } from "../ipa/practice.ts";
import { emptyIpaStats, ipaStatsFromRows } from "../ipa/stats.ts";
import {
  PATTERN_LABEL,
  SKILL_LABEL,
  bandFor,
  buildDrawGradeRows,
  buildHeatMap,
  buildIpaProgress,
  buildInsights,
  dailyTrend,
  firstVsLatest,
  improvementSentence,
  mergeAttemptPoints,
  mergeMastery,
  metPatterns,
  pointsFromQueue,
  practiceTarget,
  topImprovements,
  type AttemptPoint,
} from "./view.ts";

const entry = (score: number, attemptsN: number, lastSeen: string | null = "2026-11-01T10:00:00.000Z") => ({ score, attemptsN, lastSeen });

const unit = (id: string, locked: boolean, lessons: string[]): UnitMeta => ({
  id,
  title: { en: id, th: id },
  blurb: { en: "", th: "" },
  locked,
  lessons: lessons.map((l) => ({ id: l, title: { en: l, th: l } })),
});
const UNITS_OPEN = [
  unit("falling", false, ["falling-1", "falling-2"]),
  unit("rising", false, ["rising-1"]),
  unit("lists", true, []),
  unit("nonfinal", true, []),
  unit("tags", true, []),
];

describe("bandFor", () => {
  it("separates no data, few attempts and the three score bands", () => {
    expect(bandFor(undefined)).toBe("none");
    expect(bandFor(entry(80, 0))).toBe("none");
    expect(bandFor(entry(95, 4))).toBe("few");
    expect(bandFor(entry(95, 5))).toBe("high");
    expect(bandFor(entry(70, 5))).toBe("high");
    expect(bandFor(entry(69.9, 5))).toBe("mid");
    expect(bandFor(entry(50, 5))).toBe("mid");
    expect(bandFor(entry(49.9, 5))).toBe("low");
  });
});

describe("buildHeatMap", () => {
  const mastery: MasteryMap = {
    [skillKey("2-3", "ending", "speak")]: entry(32.4, 7),
    [skillKey("2-3", "ending", "draw")]: entry(88, 3),
    [skillKey("2-3-1", "listening", "listen")]: entry(75, 6),
  };

  it("has a row for each pattern met, in course order, and one cell per skill", () => {
    const rows = buildHeatMap(mastery);
    expect(rows.map((r) => r.pattern)).toEqual(["2-3-1", "2-3"]);
    expect(rows[0].label).toEqual(PATTERN_LABEL["2-3-1"]);
    expect(rows[0].cells.map((c) => c.skill)).toEqual(["start", "singlePeak", "peakPlacement", "ending", "range", "break", "listening"]);
  });

  it("splits cells by modality and hides scores below 5 attempts", () => {
    const rising = buildHeatMap(mastery).find((r) => r.pattern === "2-3")!;
    const ending = rising.cells.find((c) => c.skill === "ending")!;
    expect(ending.parts.map((p) => p.modality)).toEqual(["speak", "draw"]);
    expect(ending.parts[0]).toMatchObject({ score: 32, attemptsN: 7, band: "low" });
    expect(ending.parts[1]).toMatchObject({ score: null, attemptsN: 3, band: "few" });
    const listening = rising.cells.find((c) => c.skill === "listening")!;
    expect(listening.parts).toEqual([{ modality: "listen", score: null, attemptsN: 0, band: "none" }]);
  });

  it("is empty for a brand-new learner", () => {
    expect(buildHeatMap({})).toEqual([]);
    expect(metPatterns({})).toEqual([]);
  });

  it("keeps unknown patterns (from the server) after the known ones", () => {
    const rows = buildHeatMap({ ...mastery, [skillKey("9-9", "start", "speak")]: entry(60, 5) });
    expect(rows.map((r) => r.pattern)).toEqual(["2-3-1", "2-3", "9-9"]);
    expect(rows[2].label.en).toContain("9-9");
  });

  it("has bilingual labels for every skill", () => {
    for (const label of Object.values(SKILL_LABEL)) {
      expect(label.en.length).toBeGreaterThan(0);
      expect(label.th.length).toBeGreaterThan(0);
    }
  });
});

describe("mergeMastery", () => {
  it("keeps the entry resting on more attempts, and adds server-only skills", () => {
    const local: MasteryMap = { a: entry(40, 3), b: entry(90, 10), c: entry(10, 2) };
    const remote: MasteryMap = { a: entry(70, 8), b: entry(20, 4), d: entry(55, 5) };
    const merged = mergeMastery(local, remote);
    expect(merged.a.score).toBe(70);
    expect(merged.b.score).toBe(90);
    expect(merged.c.score).toBe(10);
    expect(merged.d.score).toBe(55);
  });

  it("breaks a tie with the more recent entry and changes neither input", () => {
    const local: MasteryMap = { a: entry(40, 5, "2026-11-01T00:00:00.000Z") };
    const remote: MasteryMap = { a: entry(60, 5, "2026-11-02T00:00:00.000Z") };
    expect(mergeMastery(local, remote).a.score).toBe(60);
    expect(local.a.score).toBe(40);
    expect(remote.a.score).toBe(60);
  });
});

describe("practiceTarget", () => {
  it("links to the first lesson of the unit that trains the pattern", () => {
    expect(practiceTarget("2-3-1", UNITS_OPEN)).toEqual({ unitId: "falling", lessonId: "falling-1", href: "/learn/falling/falling-1" });
    expect(practiceTarget("2-3", UNITS_OPEN)?.href).toBe("/learn/rising/rising-1");
  });

  it("skips locked units and units with no lessons, and falls back to a later unit for the pattern", () => {
    expect(practiceTarget("2-3-2", UNITS_OPEN)).toBeNull();
    expect(practiceTarget("3-1", UNITS_OPEN)).toBeNull();
    expect(practiceTarget("nope", UNITS_OPEN)).toBeNull();
    const noRising = [unit("rising", true, []), unit("lists", false, ["lists-1"])];
    expect(practiceTarget("2-3", noRising)?.href).toBe("/learn/lists/lists-1");
  });
});

describe("improvementSentence", () => {
  it("writes the ending sentence for each pattern in both languages", () => {
    expect(improvementSentence("2-3", "ending")?.en).toBe("Your yes/no questions go down at the end");
    for (const p of ["2-3-1", "2-3", "2-3-2", "3-1"]) {
      for (const s of ["start", "singlePeak", "peakPlacement", "ending", "range", "break", "listening"]) {
        const sentence = improvementSentence(p, s);
        expect(sentence?.en, `${p}/${s}`).toBeTruthy();
        expect(sentence?.th, `${p}/${s}`).toMatch(/[฀-๿]/);
      }
    }
  });

  it("returns null for things it does not know", () => {
    expect(improvementSentence("9-9", "ending")).toBeNull();
    expect(improvementSentence("2-3", "bogus")).toBeNull();
  });
});

describe("topImprovements", () => {
  const mastery: MasteryMap = {
    [skillKey("2-3", "ending", "speak")]: entry(20, 6),
    [skillKey("2-3-1", "range", "speak")]: entry(35, 9),
    [skillKey("2-3-2", "ending", "speak")]: entry(5, 8), // locked unit: skipped
    [skillKey("2-3-1", "start", "draw")]: entry(55, 5),
    [skillKey("2-3", "start", "draw")]: entry(10, 4), // not enough data: skipped
    [skillKey("2-3-1", "ending", "draw")]: entry(95, 12), // strong: never "to improve"
  };

  it("picks the weakest skills with enough data and an open lesson", () => {
    const top = topImprovements(mastery, 3, UNITS_OPEN);
    expect(top.map((t) => `${t.pattern}|${t.skill}|${t.modality}`)).toEqual(["2-3|ending|speak", "2-3-1|range|speak", "2-3-1|start|draw"]);
    expect(top[0].target.href).toBe("/learn/rising/rising-1");
    expect(top[0].sentence.en).toBe("Your yes/no questions go down at the end");
  });

  it("returns fewer than n, or none, when little is weak", () => {
    expect(topImprovements(mastery, 1, UNITS_OPEN)).toHaveLength(1);
    expect(topImprovements({ [skillKey("2-3", "ending", "speak")]: entry(90, 9) }, 3, UNITS_OPEN)).toEqual([]);
    expect(topImprovements({}, 3, UNITS_OPEN)).toEqual([]);
  });
});

describe("buildInsights", () => {
  it("has an insight only when both drawing and speaking have enough data", () => {
    const mastery: MasteryMap = {
      [skillKey("2-3", "ending", "speak")]: entry(30, 6),
      [skillKey("2-3", "ending", "draw")]: entry(90, 6),
      [skillKey("2-3-1", "ending", "speak")]: entry(80, 6),
    };
    const out = buildInsights(mastery);
    expect(out.map((o) => o.pattern)).toEqual(["2-3-1", "2-3"]);
    expect(out[0].insight).toBeNull();
    expect(out[1].insight?.state).toBe("train-voice");
  });
});

// ---------------------------------------------------------------------------------------------------------------------

/** A local-time timestamp, so the tests do not depend on the machine's time zone. */
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();
const NOW = new Date(2026, 10, 14, 15); // 14 Nov 2026, local

const point = (id: string, when: string, overall: number, pattern = "2-3-1", modality = "speak"): AttemptPoint => ({
  id,
  at: when,
  pattern,
  modality,
  overall,
});

describe("dailyTrend", () => {
  it("returns 14 days oldest first, ending today, with a mean per day", () => {
    const days = dailyTrend(
      [point("a", at(2026, 11, 14, 9), 40), point("b", at(2026, 11, 14, 18), 61), point("c", at(2026, 11, 1), 80), point("d", at(2026, 11, 13), 70)],
      NOW,
    );
    expect(days).toHaveLength(14);
    expect(days[0].day).toBe("2026-11-01");
    expect(days[13].day).toBe("2026-11-14");
    expect(days[13]).toEqual({ day: "2026-11-14", average: 51, count: 2 }); // 50.5 rounds up
    expect(days[12].average).toBe(70);
    expect(days[0].average).toBe(80);
    expect(days[5]).toEqual({ day: "2026-11-06", average: null, count: 0 });
  });

  it("ignores attempts outside the window, listening attempts and bad data", () => {
    const days = dailyTrend(
      [
        point("old", at(2026, 10, 31), 90),
        point("future", at(2026, 11, 15), 90),
        point("listen", at(2026, 11, 14), 100, "2-3-1", "listen"),
        point("nan", at(2026, 11, 14), Number.NaN),
        point("bad-date", "not a date", 50),
      ],
      NOW,
    );
    expect(days.every((d) => d.average === null)).toBe(true);
  });

  it("crosses a month boundary correctly", () => {
    const days = dailyTrend([], new Date(2026, 2, 3, 10));
    expect(days[0].day).toBe("2026-02-18");
    expect(days[13].day).toBe("2026-03-03");
  });
});

describe("firstVsLatest", () => {
  it("compares the earliest and latest attempt of each pattern with at least 2 attempts", () => {
    const rows = firstVsLatest([
      point("3", at(2026, 11, 10), 82, "2-3"),
      point("1", at(2026, 11, 2), 45, "2-3"),
      point("2", at(2026, 11, 6), 60, "2-3"),
      point("4", at(2026, 11, 7), 70, "2-3-1"), // only one: no row
      point("5", at(2026, 11, 8), 100, "2-3", "listen"), // listening is not graded
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ pattern: "2-3", first: 45, latest: 82, delta: 37, count: 3 });
    expect(rows[0].label.th.length).toBeGreaterThan(0);
  });

  it("orders rows in course order", () => {
    const rows = firstVsLatest([
      point("a", at(2026, 11, 1), 50, "2-3"),
      point("b", at(2026, 11, 2), 55, "2-3"),
      point("c", at(2026, 11, 1), 40, "2-3-1"),
      point("d", at(2026, 11, 2), 30, "2-3-1"),
    ]);
    expect(rows.map((r) => r.pattern)).toEqual(["2-3-1", "2-3"]);
    expect(rows[0].delta).toBe(-10);
  });
});

describe("attempt points", () => {
  it("turns the local queue into points and merges lists without duplicates", () => {
    const queued: QueuedAttempt = {
      id: "q1",
      row: {
        sentence_id: "s1",
        modality: "draw",
        pattern: "2-3",
        levels: null,
        checks: [],
        shape_score: 80,
        overall: 77,
        created_at: at(2026, 11, 14),
      },
      skills: [],
    };
    const local = pointsFromQueue([queued]);
    expect(local).toEqual([{ id: "q1", at: queued.row.created_at, pattern: "2-3", modality: "draw", overall: 77 }]);
    const remote = [point("q1", queued.row.created_at, 77, "2-3", "draw"), point("r2", at(2026, 11, 13), 50)];
    expect(mergeAttemptPoints(local, remote).map((p) => p.id).sort()).toEqual(["q1", "r2"]);
  });
});

describe("Draw it grades", () => {
  it("one row per pattern drawn, in course order, with Perfect-or-Good rate", () => {
    const rows = buildDrawGradeRows({
      "3-1": { perfect: 0, good: 0, miss: 2 },
      "2-3-1": { perfect: 3, good: 1, miss: 1 },
      "x-y": { perfect: 1, good: 0, miss: 0 },
      "2-3": { perfect: 0, good: 0, miss: 0 },
    });
    expect(rows.map((r) => r.pattern)).toEqual(["2-3-1", "3-1", "x-y"]);
    expect(rows[0]).toMatchObject({ label: PATTERN_LABEL["2-3-1"], total: 5, rate: 80, counts: { perfect: 3, good: 1, miss: 1 } });
    expect(rows[1].rate).toBe(0);
    expect(rows[2].label.en).toContain("x-y");
    expect(buildDrawGradeRows({})).toEqual([]);
  });
});

describe("IPA sounds section", () => {
  const byWord = Object.fromEntries(practiceWords().map((w) => [w.word, w]));
  const row = (word: string, typed: string) => {
    const answer = byWord[word].tokens;
    const got = parseIpa(typed);
    return { word, mode: "build" as const, grade: gradeIpa(answer, got).grade, answer, got, created_at: "2026-11-10T10:00:00.000Z" };
  };

  it("is null before the first checked word", () => {
    expect(buildIpaProgress(emptyIpaStats())).toBeNull();
  });

  it("shows words practised, the Perfect-or-Good rate and the weakest sounds with a focus link", () => {
    const stats = ipaStatsFromRows([
      row("think", "tɪŋk"),
      row("think", "tɪŋk"),
      row("thank", "θæŋk"),
      row("zoo", "su"),
      row("rains", "reɪns"),
      row("student", "studənt"),
    ]);
    const v = buildIpaProgress(stats)!;
    expect(v.attempts).toBe(6);
    expect(v.distinctWords).toBe(5);
    expect(v.counts).toEqual({ perfect: 1, good: 1, miss: 4 });
    expect(v.rate).toBe(33);
    expect(v.weak.map((w) => w.symbol)).toEqual(["z", "θ"]);
    expect(v.weak[0].sentence.en).toBe("You often write s for z");
    expect(v.weak[1].sentence).toEqual({ en: "You often write t for θ", th: "คุณมักเขียน t แทน θ" });
    expect(v.href.startsWith("/ipa?focus=")).toBe(true);
    // the link round-trips into the focus IpaPractice reads
    const focus = new URL(v.href, "https://myna.test").searchParams.get("focus");
    expect(parseFocus(focus)).toEqual(["z", "θ"]);
  });

  it("links to plain /ipa when no sound is weak yet", () => {
    const v = buildIpaProgress(ipaStatsFromRows([row("cat", "kæt")]))!;
    expect(v.weak).toEqual([]);
    expect(v.href).toBe("/ipa");
    expect(v.rate).toBe(100);
  });
});

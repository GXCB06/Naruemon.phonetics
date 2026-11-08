import { describe, expect, it } from "vitest";
import { INSIGHT_TEXT, HIGH_SCORE, insightFor, insightState, patternScore } from "./insight.ts";
import {
  ALPHA,
  MIN_ATTEMPTS,
  applyResults,
  confidence,
  hasEnoughData,
  parseSkillKey,
  skillKey,
  statusPoints,
  topWeakSkills,
  updateMastery,
  visibleScore,
  type MasteryEntry,
  type MasteryMap,
  type SkillResult,
} from "./mastery.ts";

const T0 = "2026-11-10T10:00:00.000Z";

/** Feed a list of statuses into one skill and return the final entry. */
function run(statuses: Array<"pass" | "warn" | "fail" | "skip">): MasteryEntry | undefined {
  let e: MasteryEntry | undefined;
  for (const status of statuses) e = updateMastery(e, { status, at: T0 });
  return e;
}

function entry(score: number, attemptsN: number, lastSeen: string | null = T0): MasteryEntry {
  return { score, attemptsN, lastSeen };
}

describe("statusPoints", () => {
  it("maps pass/warn/fail to 100/50/0 and skip to nothing", () => {
    expect(statusPoints("pass")).toBe(100);
    expect(statusPoints("warn")).toBe(50);
    expect(statusPoints("fail")).toBe(0);
    expect(statusPoints("skip")).toBeNull();
  });
});

describe("skill keys", () => {
  it("round-trips", () => {
    const key = skillKey("2-3-1", "peakPlacement", "draw");
    expect(key).toBe("2-3-1|peakPlacement|draw");
    expect(parseSkillKey(key)).toEqual({ pattern: "2-3-1", skill: "peakPlacement", modality: "draw" });
  });
  it("rejects malformed keys", () => {
    expect(parseSkillKey("2-3-1|ending")).toBeNull();
    expect(parseSkillKey("a|b|c|d")).toBeNull();
    expect(parseSkillKey("")).toBeNull();
  });
});

describe("updateMastery", () => {
  it("the first attempt sets the score and counts one attempt", () => {
    expect(run(["pass"])).toEqual({ score: 100, attemptsN: 1, lastSeen: T0 });
    expect(run(["warn"])?.score).toBe(50);
    expect(run(["fail"])?.score).toBe(0);
  });

  it("moves toward the new result by ALPHA", () => {
    const e = run(["pass", "fail"]);
    expect(e?.score).toBeCloseTo(100 - ALPHA * 100, 1);
    expect(e?.attemptsN).toBe(2);
  });

  it("recent attempts count more than old ones", () => {
    const improving = run(["fail", "fail", "fail", "pass", "pass", "pass"])!;
    const declining = run(["pass", "pass", "pass", "fail", "fail", "fail"])!;
    expect(improving.score).toBeGreaterThan(declining.score);
    expect(improving.score).toBeGreaterThan(50);
    expect(declining.score).toBeLessThan(50);
  });

  it("converges toward 100 on repeated passes and 0 on repeated fails, and stays within 0..100", () => {
    const up = run(Array(40).fill("pass"))!;
    const down = run(Array(40).fill("fail"))!;
    expect(up.score).toBeGreaterThan(99);
    expect(up.score).toBeLessThanOrEqual(100);
    expect(down.score).toBeLessThan(1);
    expect(down.score).toBeGreaterThanOrEqual(0);
  });

  it("ignores skip: no entry is created and an existing one is untouched", () => {
    expect(run(["skip"])).toBeUndefined();
    const before = run(["pass", "warn"])!;
    expect(updateMastery(before, { status: "skip", at: "2030-01-01T00:00:00.000Z" })).toBe(before);
  });

  it("does not mutate its input", () => {
    const prev = entry(80, 6);
    const copy = { ...prev };
    updateMastery(prev, { status: "fail", at: T0 });
    expect(prev).toEqual(copy);
  });

  it("accepts a Date and defaults to now", () => {
    const d = new Date("2026-12-01T08:30:00Z");
    expect(updateMastery(undefined, { status: "pass", at: d })?.lastSeen).toBe(d.toISOString());
    const auto = updateMastery(undefined, { status: "pass" });
    expect(Date.parse(auto!.lastSeen!)).not.toBeNaN();
  });

  it("treats an entry with zero attempts like a first attempt", () => {
    expect(updateMastery(entry(0, 0, null), { status: "pass", at: T0 })).toEqual({ score: 100, attemptsN: 1, lastSeen: T0 });
  });
});

describe("applyResults", () => {
  const r = (skill: SkillResult["skill"], status: SkillResult["status"], modality: SkillResult["modality"] = "draw"): SkillResult => ({
    pattern: "2-3-1",
    skill,
    modality,
    status,
  });

  it("updates every affected key and leaves the rest alone", () => {
    const other = entry(40, 7);
    const start: MasteryMap = { [skillKey("2-3", "ending", "speak")]: other };
    const next = applyResults(start, [r("ending", "pass"), r("range", "warn"), r("start", "skip")], T0);
    expect(next[skillKey("2-3-1", "ending", "draw")]).toEqual({ score: 100, attemptsN: 1, lastSeen: T0 });
    expect(next[skillKey("2-3-1", "range", "draw")].score).toBe(50);
    expect(next[skillKey("2-3-1", "start", "draw")]).toBeUndefined();
    expect(next[skillKey("2-3", "ending", "speak")]).toBe(other);
    expect(start[skillKey("2-3-1", "ending", "draw")]).toBeUndefined(); // input untouched
  });

  it("applies two results for the same key in order (two thought groups)", () => {
    const next = applyResults({}, [r("ending", "pass"), r("ending", "fail")], T0);
    expect(next[skillKey("2-3-1", "ending", "draw")]).toMatchObject({ attemptsN: 2 });
    expect(next[skillKey("2-3-1", "ending", "draw")].score).toBeCloseTo(100 - ALPHA * 100, 1);
  });

  it("keeps modalities separate", () => {
    const next = applyResults({}, [r("ending", "pass", "draw"), r("ending", "fail", "speak")], T0);
    expect(next[skillKey("2-3-1", "ending", "draw")].score).toBe(100);
    expect(next[skillKey("2-3-1", "ending", "speak")].score).toBe(0);
  });
});

describe("confidence and 'not enough data'", () => {
  it("grows with attempts, 0 at none and capped at 1", () => {
    expect(confidence(0)).toBe(0);
    expect(confidence(-3)).toBe(0);
    expect(confidence(Number.NaN)).toBe(0);
    expect(confidence(1)).toBeLessThan(confidence(5));
    expect(confidence(5)).toBeLessThan(confidence(9));
    expect(confidence(10)).toBe(1);
    expect(confidence(500)).toBe(1);
  });

  it("needs MIN_ATTEMPTS (5) attempts", () => {
    expect(MIN_ATTEMPTS).toBe(5);
    expect(hasEnoughData(4)).toBe(false);
    expect(hasEnoughData(5)).toBe(true);
  });

  it("visibleScore hides the score under 5 attempts", () => {
    expect(visibleScore(undefined)).toBeNull();
    expect(visibleScore(run(["pass", "pass", "pass", "pass"]))).toBeNull();
    expect(visibleScore(run(["pass", "pass", "pass", "pass", "pass"]))).toBe(100);
  });
});

describe("topWeakSkills", () => {
  const m: MasteryMap = {
    [skillKey("2-3-1", "ending", "speak")]: entry(30, 8),
    [skillKey("2-3-1", "range", "speak")]: entry(60, 5),
    [skillKey("2-3", "start", "draw")]: entry(85, 12),
    [skillKey("2-3-1", "singlePeak", "draw")]: entry(10, 4), // lowest, but not enough data
    [skillKey("2-3-1", "listening", "listen")]: entry(45, 6),
    [skillKey("2-3-2", "break", "speak")]: entry(90, 20),
  };

  it("returns the lowest scores with enough data, lowest first, three by default", () => {
    const top = topWeakSkills(m);
    expect(top.map((w) => `${w.pattern}|${w.skill}|${w.modality}`)).toEqual([
      "2-3-1|ending|speak",
      "2-3-1|listening|listen",
      "2-3-1|range|speak",
    ]);
    expect(top[0]).toMatchObject({ score: 30, attemptsN: 8 });
  });

  it("never includes skills under the data minimum", () => {
    expect(topWeakSkills(m, 10).some((w) => w.skill === "singlePeak")).toBe(false);
  });

  it("respects n, including 0, and an empty map", () => {
    expect(topWeakSkills(m, 1)).toHaveLength(1);
    expect(topWeakSkills(m, 0)).toEqual([]);
    expect(topWeakSkills({})).toEqual([]);
  });

  it("breaks ties by the least recently practised", () => {
    const tie: MasteryMap = {
      [skillKey("2-3-1", "ending", "speak")]: entry(50, 6, "2026-11-12T00:00:00.000Z"),
      [skillKey("2-3-1", "range", "speak")]: entry(50, 6, "2026-11-01T00:00:00.000Z"),
    };
    expect(topWeakSkills(tie).map((w) => w.skill)).toEqual(["range", "ending"]);
  });

  it("skips keys it cannot parse", () => {
    expect(topWeakSkills({ garbage: entry(0, 50) })).toEqual([]);
  });
});

describe("insightFor (drawing vs speaking)", () => {
  const withScores = (draw: number | null, speak: number | null, drawN = 6, speakN = 6): MasteryMap => {
    const m: MasteryMap = {};
    if (draw !== null) m[skillKey("2-3-1", "ending", "draw")] = entry(draw, drawN);
    if (speak !== null) m[skillKey("2-3-1", "ending", "speak")] = entry(speak, speakN);
    return m;
  };

  it("high draw, low speak -> train your voice", () => {
    const i = insightFor("2-3-1", withScores(90, 30))!;
    expect(i.state).toBe("train-voice");
    expect(i.text.en).toBe("You know the pattern; now train your voice");
    expect(i).toMatchObject({ draw: 90, speak: 30 });
  });

  it("low draw, high speak -> learn the rule", () => {
    const i = insightFor("2-3-1", withScores(30, 90))!;
    expect(i.state).toBe("learn-rule");
    expect(i.text.en).toBe("Your voice is good; learn the rule so it stays consistent");
  });

  it("both low -> review the unit", () => {
    const i = insightFor("2-3-1", withScores(20, 35))!;
    expect(i.state).toBe("review-unit");
    expect(i.text.en).toBe("Start here: review the unit");
  });

  it("both high -> mastered", () => {
    const i = insightFor("2-3-1", withScores(95, 80))!;
    expect(i.state).toBe("mastered");
    expect(i.text.en).toBe("Mastered");
  });

  it("every state has English and Thai text", () => {
    for (const t of Object.values(INSIGHT_TEXT)) {
      expect(t.en.length).toBeGreaterThan(0);
      expect(t.th).toMatch(/[฀-๿]/);
    }
  });

  it("returns null until BOTH modalities have enough data", () => {
    expect(insightFor("2-3-1", {})).toBeNull();
    expect(insightFor("2-3-1", withScores(90, null))).toBeNull();
    expect(insightFor("2-3-1", withScores(null, 90))).toBeNull();
    expect(insightFor("2-3-1", withScores(90, 30, 6, 4))).toBeNull();
    expect(insightFor("2-3-1", withScores(90, 30, 5, 5))).not.toBeNull();
  });

  it("only looks at the asked pattern and ignores listening", () => {
    const m = withScores(90, 30);
    m[skillKey("2-3", "ending", "draw")] = entry(0, 20);
    m[skillKey("2-3-1", "listening", "listen")] = entry(0, 20);
    expect(insightFor("2-3-1", m)).toMatchObject({ draw: 90, speak: 30 });
    expect(insightFor("3-1", m)).toBeNull();
  });

  it("averages the skills of a modality that have enough data and skips thin ones", () => {
    const m: MasteryMap = {
      [skillKey("2-3-1", "ending", "draw")]: entry(100, 6),
      [skillKey("2-3-1", "range", "draw")]: entry(60, 6),
      [skillKey("2-3-1", "start", "draw")]: entry(0, 2), // ignored
    };
    expect(patternScore(m, "2-3-1", "draw")).toBe(80);
    expect(patternScore(m, "2-3-1", "speak")).toBeNull();
  });

  it("the boundary is HIGH_SCORE inclusive", () => {
    expect(insightState(HIGH_SCORE, HIGH_SCORE - 0.1)).toBe("train-voice");
    expect(insightState(HIGH_SCORE, HIGH_SCORE)).toBe("mastered");
    expect(insightState(HIGH_SCORE - 0.1, HIGH_SCORE - 0.1)).toBe("review-unit");
  });
});

import { describe, expect, it } from "vitest";
import { gradeIpa, parseIpa, practiceWords } from "./practice.ts";
import {
  MISSING,
  addIpaAttempt,
  confusionKey,
  emptyIpaStats,
  ipaStatsFromRows,
  mergeIpaStats,
  mixUpSentence,
  parseConfusionKey,
  parseIpaStats,
  symbolOutcomes,
  topMixUp,
  weakestSymbols,
  type IpaAttemptRow,
} from "./stats.ts";

const byWord = Object.fromEntries(practiceWords().map((w) => [w.word, w]));
const AT = "2026-11-10T10:00:00.000Z";

/** A checked word as IpaPractice records it: the grade comes from the real grader. */
function row(word: string, typed: string, mode: "build" | "write" = "build"): IpaAttemptRow {
  const answer = byWord[word].tokens;
  const got = parseIpa(typed);
  return { word, mode, grade: gradeIpa(answer, got).grade, answer, got, created_at: AT };
}

describe("symbolOutcomes", () => {
  it("all right for a perfect answer, and the stress mark is not a sound", () => {
    const o = symbolOutcomes(byWord.student.tokens, byWord.student.tokens);
    expect(o.map((x) => x.want)).toEqual(["s", "t", "u", "d", "ə", "n", "t"]);
    expect(o.every((x) => x.ok)).toBe(true);
  });

  it("finds the mix-up: t written for θ", () => {
    const o = symbolOutcomes(byWord.think.tokens, parseIpa("tɪŋk"));
    expect(o).toEqual([
      { want: "θ", ok: false, got: "t" },
      { want: "ɪ", ok: true, got: "ɪ" },
      { want: "ŋ", ok: true, got: "ŋ" },
      { want: "k", ok: true, got: "k" },
    ]);
  });

  it("a left-out sound is MISSING; an extra symbol costs no answer symbol", () => {
    const bird = symbolOutcomes(byWord.bird.tokens, parseIpa("bɜd"));
    expect(bird.find((x) => x.want === "r")).toEqual({ want: "r", ok: false, got: MISSING });
    const extra = symbolOutcomes(byWord.cat.tokens, parseIpa("kæts"));
    expect(extra.every((x) => x.ok)).toBe(true);
  });

  it("a missing stress mark only makes it Good: every sound still counts as right", () => {
    const o = symbolOutcomes(byWord.student.tokens, parseIpa("studənt"));
    expect(o.every((x) => x.ok)).toBe(true);
  });

  it("a repeated sound is counted once per place it appears", () => {
    // vegetable /ˈvɛdʒtəbəl/ has ə twice; the learner writes ɛ for the second one
    const o = symbolOutcomes(byWord.vegetable.tokens, parseIpa("ˈvɛdʒtəbɛl"));
    const schwas = o.filter((x) => x.want === "ə");
    expect(schwas.length).toBe(2);
    expect(schwas.filter((x) => !x.ok)).toEqual([{ want: "ə", ok: false, got: "ɛ" }]);
  });
});

describe("addIpaAttempt / ipaStatsFromRows", () => {
  it("counts words, grades, per-symbol accuracy and confusions", () => {
    const s = ipaStatsFromRows([row("think", "tɪŋk"), row("thank", "θæŋk"), row("three", "tri"), row("rains", "reɪns"), row("zoo", "zu")]);
    expect(s.attempts).toBe(5);
    expect(s.grades).toEqual({ perfect: 2, good: 0, miss: 3 });
    expect(s.words).toEqual({ think: 1, thank: 1, three: 1, rains: 1, zoo: 1 });
    expect(s.symbols["θ"]).toEqual({ n: 3, wrong: 2 });
    expect(s.symbols["z"]).toEqual({ n: 2, wrong: 1 });
    expect(s.confusions[confusionKey("θ", "t")]).toBe(2);
    expect(s.confusions[confusionKey("z", "s")]).toBe(1);
    expect(s.symbols["ˈ"]).toBeUndefined();
  });

  it("does not change the stats it is given and ignores malformed rows", () => {
    const base = emptyIpaStats();
    const next = addIpaAttempt(base, row("cat", "kæt"));
    expect(base.attempts).toBe(0);
    expect(next.attempts).toBe(1);
    expect(addIpaAttempt(next, { word: 3 } as unknown as IpaAttemptRow)).toBe(next);
    expect(ipaStatsFromRows([null, "x", { word: "cat" }]).attempts).toBe(0);
  });

  it("confusion keys round-trip, including a left-out sound", () => {
    expect(parseConfusionKey(confusionKey("θ", "t"))).toEqual({ want: "θ", got: "t" });
    expect(parseConfusionKey(confusionKey("r", MISSING))).toEqual({ want: "r", got: "" });
    expect(parseConfusionKey("nonsense")).toBeNull();
  });

  it("round-trips through JSON and survives corrupt storage", () => {
    const s = ipaStatsFromRows([row("think", "tɪŋk"), row("bird", "bɜd")]);
    expect(parseIpaStats(JSON.stringify(s))).toEqual(s);
    expect(parseIpaStats("{oops")).toEqual(emptyIpaStats());
    expect(parseIpaStats(JSON.stringify({ attempts: -1 }))).toEqual(emptyIpaStats());
    const partly = parseIpaStats(
      JSON.stringify({ ...s, symbols: { θ: { n: 2, wrong: 1 }, bad: { n: "x" } }, confusions: { "θ>t": 1, junk: 2 } }),
    );
    expect(partly.symbols).toEqual({ θ: { n: 2, wrong: 1 } });
    expect(partly.confusions).toEqual({ "θ>t": 1 });
  });

  it("merge keeps the side resting on more checked words", () => {
    const small = ipaStatsFromRows([row("cat", "kæt")]);
    const big = ipaStatsFromRows([row("cat", "kæt"), row("cup", "kʌp")]);
    expect(mergeIpaStats(small, big)).toBe(big);
    expect(mergeIpaStats(big, small)).toBe(big);
    expect(mergeIpaStats(small, null)).toBe(small);
  });
});

describe("weakest sounds", () => {
  const stats = ipaStatsFromRows([
    row("think", "tɪŋk"),
    row("thank", "tæŋk"),
    row("three", "θri"),
    row("rains", "reɪns"),
    row("zoo", "su"),
    row("bird", "bɜd"),
    row("world", "wɜld"),
    row("ship", "ʃɪp"),
    row("fish", "fɪʃ"),
  ]);

  it("ranks by accuracy, needs enough checks and at least one mistake", () => {
    const weak = weakestSymbols(stats, 5);
    // z 0/2 right, θ 1/3, r 2/4 (left out of bird and world)
    expect(weak.map((w) => w.symbol)).toEqual(["z", "θ", "r"]);
    expect(weak.find((w) => w.symbol === "r")).toMatchObject({ n: 4, wrong: 2, accuracy: 50, mixUp: { got: "", count: 2 } });
    expect(weak.find((w) => w.symbol === "z")).toMatchObject({ n: 2, wrong: 2, accuracy: 0, mixUp: { got: "s", count: 2 } });
    expect(weak.find((w) => w.symbol === "θ")).toMatchObject({ accuracy: 33, mixUp: { got: "t", count: 2 } });
    expect(weak.some((w) => w.symbol === "ʃ")).toBe(false); // always right
    expect(weakestSymbols(stats, 1).length).toBe(1);
    expect(weakestSymbols(stats, 5, 99)).toEqual([]);
  });

  it("the most common mix-up wins", () => {
    const s = ipaStatsFromRows([row("think", "tɪŋk"), row("thank", "sæŋk"), row("three", "tri")]);
    expect(topMixUp(s, "θ")).toEqual({ got: "t", count: 2 });
    expect(topMixUp(s, "k")).toBeNull();
  });

  it("writes the sentence in English and Thai", () => {
    const z = weakestSymbols(stats, 5).find((w) => w.symbol === "z")!;
    const r = weakestSymbols(stats, 5).find((w) => w.symbol === "r")!;
    expect(mixUpSentence(z)).toEqual({ en: "You often write s for z", th: "คุณมักเขียน s แทน z" });
    expect(mixUpSentence(r)).toEqual({ en: "You often leave out r", th: "คุณมักลืมใส่เสียง r" });
    const noMix = mixUpSentence({ symbol: "θ", n: 4, wrong: 1, accuracy: 75, mixUp: null });
    expect(noMix.en).toBe("You got θ right 3 of 4 times");
    expect(noMix.th.length).toBeGreaterThan(0);
  });
});

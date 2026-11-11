import { describe, expect, it } from "vitest";
import type { AzureAssessment, AzurePhoneme, AzureWord } from "../azure/parse.ts";
import { MAX_FIXES, overallWord, readReport } from "./score.ts";
import { tokenize } from "./text.ts";

const ph = (ipa: string, accuracy: number, heard?: string): AzurePhoneme => ({
  ipa,
  accuracy,
  nbest: heard ? [{ ipa: heard, score: accuracy }] : [{ ipa, score: accuracy }],
  offsetSec: null,
  durationSec: null,
});
const word = (w: string, accuracy: number | null, phonemes: AzurePhoneme[] = []): AzureWord => ({
  word: w,
  offsetSec: 0,
  durationSec: 0.3,
  accuracy,
  errorType: "None",
  syllables: [],
  phonemes,
});
const assessment = (words: AzureWord[], over: Partial<AzureAssessment> = {}): AzureAssessment => ({
  status: "Success",
  pronScore: 78.4,
  prosodyScore: 70,
  accuracy: 80,
  fluency: 90.2,
  completeness: 100,
  monotone: false,
  breaks: [],
  words,
  ...over,
});

describe("read report", () => {
  const tokens = tokenize("I think it works.");

  it("puts each Azure score on our word and rounds the totals", () => {
    const r = readReport(tokens, assessment([word("I", 95), word("think", 40, [ph("θ", 20, "s"), ph("ɪ", 90), ph("ŋ", 95), ph("k", 90)]), word("it", 88), word("works", 75)]));
    expect(r.words.map((w) => w.band)).toEqual(["good", "poor", "good", "ok"]);
    expect([r.overall, r.accuracy, r.fluency, r.completeness, r.prosody]).toEqual([78, 80, 90, 100, 70]);
  });

  it("explains a sound that came out as another one, in class notation", () => {
    const r = readReport(tokens, assessment([word("I", 95), word("think", 40, [ph("θ", 20, "s"), ph("ɪ", 90), ph("ŋ", 95), ph("k", 90)]), word("it", 88), word("works", 75)]));
    const fix = r.fixes[0];
    expect(fix.word).toBe("think");
    expect(fix.message.en).toBe("In “think”, /θ/ sounded like /s/.");
    expect(fix.message.th).toContain("/θ/");
    expect(r.words[1].mismatches[0]).toEqual({ expected: "θ", spoken: "s" });
  });

  it("marks a word Azure did not hear as omitted and lists it first", () => {
    const r = readReport(tokens, assessment([word("I", 95), word("think", 90), word("works", 50)]));
    expect(r.words.map((w) => w.band)).toEqual(["good", "good", "omitted", "poor"]);
    expect(r.fixes.map((f) => f.word)).toEqual(["it", "works"]);
    expect(r.fixes[0].message.en).toContain("didn't hear");
  });

  it("uses the final-consonant message when the last sound was dropped", () => {
    const r = readReport(tokenize("a cat"), assessment([word("a", 90), word("cat", 60, [ph("k", 90), ph("æ", 90), ph("t", 10)])]));
    expect(r.fixes[0].message.en).toContain("final /t/");
  });

  it("lists at most five fixes, weakest first, and none for a clean read", () => {
    const many = tokenize("a b c d e f g");
    const r = readReport(many, assessment(many.map((t, i) => word(t.text, 30 + i * 5))));
    expect(r.fixes).toHaveLength(MAX_FIXES);
    expect(r.fixes.map((f) => f.tokenIndex)).toEqual([0, 1, 2, 3, 4]);
    const clean = readReport(tokens, assessment([word("I", 95), word("think", 92), word("it", 90), word("works", 88)]));
    expect(clean.fixes).toEqual([]);
  });

  it("copes with missing scores", () => {
    const r = readReport(tokens, assessment([word("I", null), word("think", null), word("it", null), word("works", null)], { pronScore: null, accuracy: null, fluency: null, completeness: null, prosodyScore: null }));
    expect(r.words.every((w) => w.band === "unknown")).toBe(true);
    expect([r.overall, r.accuracy, r.prosody]).toEqual([null, null, null]);
    expect(r.fixes).toEqual([]);
  });

  it("has a word for every range of the overall score", () => {
    expect([90, 75, 55, 20, null].map((n) => overallWord(n).en)).toEqual(["Clear and natural!", "Good, a few sounds to fix", "Getting there", "Let's practise this one", "Scored"]);
  });
});

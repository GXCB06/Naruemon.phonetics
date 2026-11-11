import { dictionary } from "cmu-pronouncing-dictionary";
import { describe, expect, it } from "vitest";
import { OVERRIDES } from "../ipa/overrides.ts";
import { MAX_SENTENCE, MAX_TEXT, distinctKeys, ipaForKeys, matchWords, readableSentences, splitSentences, tokenize, wordAtChar } from "./text.ts";

const texts = (s: string) => splitSentences(s).map((x) => x.text);

describe("splitSentences", () => {
  it("splits at . ! ? and trims", () => {
    expect(texts("Good morning! Would you like coffee or tea? Yes, please.")).toEqual(["Good morning!", "Would you like coffee or tea?", "Yes, please."]);
  });

  it("does not split inside abbreviations, initials or decimals", () => {
    expect(texts("Mr. Smith lives in St. Louis. He is 3.5 metres tall.")).toEqual(["Mr. Smith lives in St. Louis.", "He is 3.5 metres tall."]);
    expect(texts("J. Smith came. He sat.")).toEqual(["J. Smith came.", "He sat."]);
    expect(texts("I like fruit, e.g. apples. And pears.")).toEqual(["I like fruit, e.g. apples.", "And pears."]);
  });

  it("splits at line breaks and keeps a closing quote with its sentence", () => {
    expect(texts('She said, "Come here."\nHe came.')).toEqual(['She said, "Come here."', "He came."]);
    expect(texts("First line\nSecond line")).toEqual(["First line", "Second line"]);
  });

  it("keeps a last sentence with no full stop, drops empty pieces, and collapses spaces", () => {
    expect(texts("Hello   there.   How are you")).toEqual(["Hello there.", "How are you"]);
    expect(texts("  \n \n")).toEqual([]);
    expect(texts("... ?!")).toEqual([]);
  });

  it("marks a very long sentence as too long to score", () => {
    const long = "word ".repeat(80).trim() + ".";
    expect(long.length).toBeGreaterThan(MAX_SENTENCE);
    expect(splitSentences(long)[0].long).toBe(true);
    expect(splitSentences("Short one.")[0].long).toBe(false);
  });
});

describe("readableSentences", () => {
  it("cuts a long text at a sentence end and says so", () => {
    const sentence = "This is a sentence of about forty characters.";
    const r = readableSentences(Array(60).fill(sentence).join(" "));
    expect(r.truncated).toBe(true);
    expect(r.sentences.reduce((n, s) => n + s.text.length + 1, 0)).toBeLessThanOrEqual(MAX_TEXT + sentence.length);
    expect(r.sentences.every((s) => s.text === sentence)).toBe(true);
  });

  it("takes a short text whole", () => {
    expect(readableSentences("One. Two.")).toEqual({ sentences: [{ text: "One.", long: false }, { text: "Two.", long: false }], truncated: false });
  });
});

describe("tokenize", () => {
  it("finds words with their positions, keeping isn't and well-known whole", () => {
    const t = tokenize("It isn't a well-known fact, Mali.");
    expect(t.map((x) => x.text)).toEqual(["It", "isn't", "a", "well-known", "fact", "Mali"]);
    expect(t.map((x) => x.key)).toEqual(["it", "isn't", "a", "well-known", "fact", "mali"]);
    expect("It isn't a well-known fact, Mali.".slice(t[3].start, t[3].end)).toBe("well-known");
  });

  it("reads curly apostrophes like straight ones", () => {
    expect(tokenize("Don’t go.")[0]).toMatchObject({ text: "Don’t", key: "don't" });
  });

  it("finds the word at a character position", () => {
    const t = tokenize("Good morning, Mali.");
    expect([0, 3, 4, 5, 12, 13, 14, 18].map((c) => wordAtChar(t, c))).toEqual([0, 0, 0, 1, 1, 1, 2, 2]);
    expect(wordAtChar(t, -1)).toBe(-1);
  });
});

describe("IPA of any word", () => {
  it("gives class notation for dictionary words and null for the rest", () => {
    const m = ipaForKeys(["rains", "actor", "first", "xyzzy", "3d"], dictionary, OVERRIDES);
    expect(m["rains"].ipa).toBe("reɪnz");
    expect(m["actor"].ipa).toBe("ˈæktər"); // class notation: ər, not ɚ
    expect(m["first"].ipa).toBe("fɜrst"); // ɜr, not ɝ
    expect(m["xyzzy"].ipa).toBeNull();
    expect(m["3d"].ipa).toBeNull();
  });

  it("lists distinct keys once, capped", () => {
    expect(distinctKeys("Go go GO. Stop!")).toEqual(["go", "stop"]);
    expect(distinctKeys("a b c d e", 3)).toHaveLength(3);
  });
});

describe("matching Azure's words", () => {
  const tokens = tokenize("Would you like coffee or tea?");
  const azure = (...words: string[]) => words.map((word) => ({ word }));

  it("matches word for word", () => {
    expect(matchWords(tokens, azure("would", "you", "like", "coffee", "or", "tea"))).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("leaves out a word Azure did not hear, and skips one it inserted", () => {
    expect(matchWords(tokens, azure("would", "you", "coffee", "or", "tea"))).toEqual([0, 1, null, 2, 3, 4]);
    expect(matchWords(tokens, azure("would", "um", "you", "like", "coffee", "or", "tea"))).toEqual([0, 2, 3, 4, 5, 6]);
  });

  it("never matches backwards, and ignores case and punctuation", () => {
    expect(matchWords(tokenize("Tea or coffee"), azure("Coffee", "tea."))).toEqual([1, null, null]);
    expect(matchWords(tokenize("Isn't it?"), azure("isn’t", "it"))).toEqual([0, 1]);
  });
});

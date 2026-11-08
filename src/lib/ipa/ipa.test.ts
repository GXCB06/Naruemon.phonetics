import { describe, expect, it } from "vitest";
import { dictionary } from "cmu-pronouncing-dictionary";
import { SENTENCES } from "../intonation/lessons.ts";
import ipaTable from "../intonation/ipa.generated.json" with { type: "json" };
import { ARPABET_TO_IPA, VOWELS, arpaToIpa, formatSyllables, parseArpabet, parsePhone } from "./arpabet.ts";
import { isLegalOnset, syllabifyArpabet } from "./syllabify.ts";
import { OVERRIDES } from "./overrides.ts";
import { buildWordIpa, normalizeWord, wordsOfSentence } from "./words.ts";

const syl = (arpabet: string) => syllabifyArpabet(arpabet).map((s) => s.ipa);

describe("ARPAbet -> IPA", () => {
  it("covers exactly the 39 ARPAbet phones", () => {
    expect(Object.keys(ARPABET_TO_IPA)).toHaveLength(39);
    expect(VOWELS.size).toBe(15);
  });

  it("uses ɹ for R and splits the r-coloured vowel by stress", () => {
    expect(arpaToIpa(parsePhone("R"))).toBe("ɹ");
    expect(arpaToIpa(parsePhone("ER0"))).toBe("ɚ");
    expect(arpaToIpa(parsePhone("ER1"))).toBe("ɝ");
  });

  it("splits AH by stress (ə vs ʌ)", () => {
    expect(arpaToIpa(parsePhone("AH0"))).toBe("ə");
    expect(arpaToIpa(parsePhone("AH1"))).toBe("ʌ");
    expect(arpaToIpa(parsePhone("AH2"))).toBe("ʌ");
  });

  it("maps diphthongs and affricates", () => {
    expect(parseArpabet("CH AY1 JH OW0").map(arpaToIpa).join("")).toBe("tʃaɪdʒoʊ");
  });

  it("rejects unknown phones and malformed stress digits instead of guessing", () => {
    expect(() => parsePhone("XX1")).toThrow(/Unknown ARPAbet/);
    expect(() => parsePhone("AH")).toThrow(/stress digit/);
    expect(() => parsePhone("K1")).toThrow(/must not have/);
  });

  it("places the stress mark before the stressed syllable", () => {
    expect(formatSyllables(["prɪ", "ti"], [1, 0])).toBe("ˈprɪ.ti");
    expect(formatSyllables(["ɪn", "tɚ", "næ", "ʃə", "nəl"], [2, 0, 1, 0, 0])).toBe("ˌɪn.tɚ.ˈnæ.ʃə.nəl");
    expect(formatSyllables(["bʌs"], [1])).toBe("bʌs"); // monosyllables get no mark
    expect(formatSyllables(["ə", "ɡoʊ"], [0, 1])).toBe("ə.ˈɡoʊ");
    expect(formatSyllables(["æk", "tɪ", "veɪ", "ʃən"], [1, 0, 2, 0])).toBe("ˈæk.tɪ.ˌveɪ.ʃən");
  });
});

describe("maximal-onset syllabifier", () => {
  it("splits the lesson words", () => {
    expect(syl("P R IH1 T IY0")).toEqual(["pɹɪ", "ti"]); // pretty
    expect(syl("W UH1 M AH0 N")).toEqual(["wʊ", "mən"]); // woman
    expect(syl("S T UW1 D AH0 N T")).toEqual(["stu", "dənt"]); // student
    expect(syl("K AH1 M IH0 NG")).toEqual(["kʌ", "mɪŋ"]); // coming
    expect(syl("HH AE1 R IY0")).toEqual(["hæ", "ɹi"]); // harry
    expect(syl("IH1 Z AH0 N T")).toEqual(["ɪ", "zənt"]); // isn't
  });

  it("keeps one-syllable words whole", () => {
    expect(syl("N EY1 M")).toEqual(["neɪm"]);
    expect(syl("S T R EH1 NG TH S")).toEqual(["stɹɛŋθs"]);
  });

  it("gives the second syllable the longest legal onset", () => {
    expect(syl("AH0 S T R AO1 N AH0 M IY0")).toEqual(["ə", "stɹɔ", "nə", "mi"]); // astronomy: str onset
    expect(syl("AH0 P L AY1")).toEqual(["ə", "plaɪ"]); // apply: pl
    expect(syl("IH0 N S T R AH1 K T")).toEqual(["ɪn", "stɹʌkt"]); // instruct: n | str
  });

  it("puts what is not a legal onset into the coda", () => {
    expect(syl("K AE1 P T AH0 N")).toEqual(["kæp", "tən"]); // captain: pt is not an onset
    expect(syl("S IH1 NG ER0")).toEqual(["sɪŋ", "ɚ"]); // singer: ng can never start a syllable
    expect(syl("B AE1 NG K ER0")).toEqual(["bæŋ", "kɚ"]); // banker
    expect(syl("W IH1 N T ER0")).toEqual(["wɪn", "tɚ"]); // winter
  });

  it("reads stress from the vowel of each syllable", () => {
    const [a, b] = syllabifyArpabet("P R IH1 T IY0");
    expect([a.stress, b.stress]).toEqual([1, 0]);
    const s = syllabifyArpabet("IH2 N T ER0 N AE1 SH AH0 N AH0 L");
    expect(s.map((x) => x.stress)).toEqual([2, 0, 1, 0, 0]);
  });

  it("knows the onset inventory", () => {
    expect(isLegalOnset([])).toBe(true);
    expect(isLegalOnset(["NG"])).toBe(false);
    expect(isLegalOnset(["S", "T", "R"])).toBe(true);
    expect(isLegalOnset(["T", "L"])).toBe(false);
    expect(isLegalOnset(["P", "T"])).toBe(false);
  });

  it("throws on a word with no vowel", () => {
    expect(() => syllabifyArpabet("S T")).toThrow(/no vowel/);
  });
});

describe("word entries", () => {
  const overrides = { harry: { arpabet: "HH AE1 R IY0", reason: "test" } };

  it("builds display IPA with stress marks for 2-syllable words", () => {
    const e = (w: string) => buildWordIpa(w, dictionary, overrides);
    expect(e("pretty").ipa).toBe("ˈpɹɪ.ti");
    expect(e("woman").ipa).toBe("ˈwʊ.mən");
    expect(e("student").ipa).toBe("ˈstu.dənt");
    expect(e("coming").ipa).toBe("ˈkʌ.mɪŋ");
    expect(e("name").ipa).toBe("neɪm");
  });

  it("prefers overrides and says so", () => {
    expect(buildWordIpa("harry", dictionary, overrides)).toMatchObject({ source: "override", ipa: "ˈhæ.ɹi" });
    expect(buildWordIpa("pretty", dictionary, overrides).source).toBe("cmudict");
  });

  it("fails loudly for a word that is in neither CMUdict nor the overrides", () => {
    expect(() => buildWordIpa("zzyzxqq", dictionary, {})).toThrow(/not in CMUdict[\s\S]*OVERRIDES/);
  });

  it("normalises words from sentence text", () => {
    expect(normalizeWord("isn't,")).toBe("isn't");
    expect(normalizeWord("woman.")).toBe("woman");
    expect(wordsOfSentence("Harry is coming, isn't he?")).toEqual(["harry", "is", "coming", "isn't", "he"]);
  });
});

describe("lessons use the generated IPA", () => {
  // The IPA the lessons had when it was typed by hand (Phase 0a), word by word: [ipa, stressed] per syllable.
  // "pretty" differs on purpose: it was "prɪ" (r instead of ɹ).
  const EXPECTED: Record<string, [string, boolean][]> = {
    she: [["ʃi", false]],
    is: [["ɪz", false]],
    a: [["ə", false]],
    pretty: [["pɹɪ", true], ["ti", false]],
    woman: [["wʊ", true], ["mən", false]],
    what: [["wʌt", false]],
    your: [["jɚ", false]],
    name: [["neɪm", true]],
    are: [["ɑɹ", false]],
    you: [["ju", false]],
    student: [["stu", true], ["dənt", false]],
    if: [["ɪf", false]],
    it: [["ɪt", false]],
    rains: [["ɹeɪnz", true]],
    i: [["aɪ", false]],
    will: [["wɪl", false]],
    take: [["teɪk", false]],
    the: [["ðə", false]],
    bus: [["bʌs", true]],
    harry: [["hæ", true], ["ɹi", false]],
    coming: [["kʌ", true], ["mɪŋ", false]],
    "isn't": [["ɪ", true], ["zənt", false]],
    he: [["hi", false]],
  };

  it("reproduces the previous hand-written IPA and stress flags", () => {
    const seen = new Set<string>();
    for (const sentence of SENTENCES) {
      for (const group of sentence.groups) {
        for (const word of group.words) {
          const key = normalizeWord(word.text);
          seen.add(key);
          // `stressed` is only true on nucleus syllables or lexically stressed syllables of 2+ syllable words
          expect(word.syllables.map((s) => [s.ipa, !!s.stressed]), key).toEqual(EXPECTED[key]);
        }
      }
    }
    expect([...seen].sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it("generated file covers every lesson word and nothing is stale", () => {
    const fromLessons = new Set(SENTENCES.flatMap((s) => wordsOfSentence(s.text)));
    expect(new Set(Object.keys(ipaTable.words))).toEqual(fromLessons);
  });

  it("generated file equals a fresh build from CMUdict + overrides (run `npm run build:ipa` if this fails)", () => {
    for (const [word, entry] of Object.entries(ipaTable.words)) {
      expect(buildWordIpa(word, dictionary, OVERRIDES), word).toEqual(entry);
    }
  });
});

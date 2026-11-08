import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ipaTable from "../intonation/ipa.generated.json" with { type: "json" };
import { ARPABET_TO_IPA } from "../ipa/arpabet.ts";
import {
  BAND_GOOD,
  BAND_OK,
  bandOf,
  FINAL_DROPPED_MAX,
  FINAL_WEAK_MAX,
  findFinalConsonantIssues,
  IPA_MAPPINGS,
  isVowelIpa,
  normalizeIpa,
  wordViews,
} from "./ipa.ts";
import { parseAzureResult, type AzureAssessment } from "./parse.ts";

const fixture = (name: string): AzureAssessment =>
  parseAzureResult(JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8")));
const good = () => fixture("good-i-need-a-pen.json");
const bad = () => fixture("monotone-missed-n.json");

/** Every IPA symbol the lesson pipeline can produce (the ARPAbet map's targets, plus the unstressed ER0 ɚ and AH0 ə). */
const lessonSet = new Set<string>(["ɚ", "ə", ...Object.values(ARPABET_TO_IPA).flatMap((v) => [...v])]);

/** Every symbol (as a code point) our generated lessons actually use. */
const lessonSymbols = (() => {
  const set = new Set<string>();
  for (const entry of Object.values(ipaTable.words as Record<string, { syllables: { ipa: string }[] }>)) {
    for (const s of entry.syllables) for (const ch of s.ipa) set.add(ch);
  }
  return set;
})();

describe("normalizeIpa", () => {
  it("maps Azure's plain g to the lesson symbol ɡ (the only difference that occurs in the fixtures)", () => {
    expect(normalizeIpa("g")).toBe("ɡ");
    expect("g".codePointAt(0)).toBe(0x67);
    expect(normalizeIpa("g").codePointAt(0)).toBe(0x261);
  });

  it("maps r to ɹ and the r-coloured vowels to ɚ / ɝ", () => {
    expect(normalizeIpa("rɛd")).toBe("ɹɛd");
    expect(normalizeIpa("ɹɛd")).toBe("ɹɛd");
    expect(normalizeIpa("ɚ")).toBe("ɚ");
    expect(normalizeIpa("ɝ")).toBe("ɝ");
    expect(normalizeIpa("ɜ˞")).toBe("ɝ");
    expect(normalizeIpa("ɜ")).toBe("ɝ");
    expect(normalizeIpa("ə˞")).toBe("ɚ");
    expect(normalizeIpa("ɹ̩")).toBe("ɚ");
  });

  it("writes affricates and diphthongs the way the lessons do", () => {
    expect(normalizeIpa("t͡ʃ")).toBe("tʃ");
    expect(normalizeIpa("ʤ")).toBe("dʒ");
    expect(normalizeIpa("e")).toBe("eɪ");
    expect(normalizeIpa("eɪ")).toBe("eɪ"); // not eɪɪ
    expect(normalizeIpa("o")).toBe("oʊ");
    expect(normalizeIpa("oʊ")).toBe("oʊ");
  });

  it("drops stress, length, aspiration and syllable marks", () => {
    expect(normalizeIpa("ˈpʰɪ.ti")).toBe("pɪti");
    expect(normalizeIpa("iː")).toBe("i");
    expect(normalizeIpa("ˌɪ")).toBe("ɪ");
  });

  it("leaves symbols that are already in the lesson set alone", () => {
    for (const ch of lessonSymbols) {
      if (ch === "a" || ch === "e" || ch === "u" || ch === "i") continue; // parts of diphthongs / the plain vowels
      expect(normalizeIpa(ch), ch).toBe(ch);
    }
    expect(normalizeIpa("aɪ")).toBe("aɪ");
    expect(normalizeIpa("ɔɪ")).toBe("ɔɪ");
    expect(normalizeIpa("ʃʒθðŋ")).toBe("ʃʒθðŋ");
  });

  it("passes unknown symbols through unchanged", () => {
    expect(normalizeIpa("ʔ")).toBe("ʔ");
    expect(normalizeIpa("")).toBe("");
  });

  it("makes an Azure spelling of a lesson word equal the lesson's IPA", () => {
    const words = ipaTable.words as Record<string, { syllables: { ipa: string }[] }>;
    const azureSpellings: Record<string, string> = {
      pretty: "prɪti", // r instead of ɹ
      your: "jɜ˞",
      are: "ɑr",
      rains: "reɪnz", // r and a bare e
    };
    const lesson = (w: string) => words[w].syllables.map((s) => s.ipa).join("");
    expect(normalizeIpa(azureSpellings.pretty)).toBe(lesson("pretty"));
    expect(normalizeIpa(azureSpellings.are)).toBe(lesson("are"));
    expect(normalizeIpa("reɪnz")).toBe(lesson("rains"));
    // "your" is jɚ in the lessons (override for the unstressed form) and jɝ when Azure treats it as stressed:
    // both are the r-coloured vowel family, but they are different symbols and we do not hide that difference.
    expect(normalizeIpa(azureSpellings.your)).toBe("jɝ");
  });

  it("documents every mapping, and its fixture claim is true", () => {
    const fixtureIpa = new Set<string>();
    for (const a of [good(), bad()]) {
      for (const w of a.words) {
        for (const s of w.syllables) fixtureIpa.add(s.ipa);
        for (const p of w.phonemes) {
          fixtureIpa.add(p.ipa);
          for (const n of p.nbest) fixtureIpa.add(n.ipa);
        }
      }
    }
    // Of everything in the two recorded fixtures, only Azure's plain "g" differs from the lesson symbol set.
    expect([...fixtureIpa].filter((x) => normalizeIpa(x) !== x)).toEqual(["g"]);
    for (const m of IPA_MAPPINGS) {
      expect(m.why.length, m.from).toBeGreaterThan(10);
      expect(m.inFixtures, m.from).toBe(fixtureIpa.has(m.from));
      // every mapping lands inside the lesson symbol set
      for (const ch of m.to) expect(lessonSet.has(ch), `${m.from} -> ${m.to}`).toBe(true);
    }
  });

  it("recognises vowels vs consonants", () => {
    for (const v of ["ɪ", "i", "ə", "ɚ", "ɝ", "aɪ", "eɪ", "oʊ", "ɔɪ", "aʊ", "ʌ", "ɛ", "æ", "ɑ", "ʊ", "u"]) expect(isVowelIpa(v), v).toBe(true);
    for (const c of ["n", "t", "d", "ɹ", "r", "ŋ", "tʃ", "dʒ", "ð", "g", "ɡ"]) expect(isVowelIpa(c), c).toBe(false);
  });
});

describe("bands", () => {
  it("splits accuracy at 80 and 60", () => {
    expect([100, BAND_GOOD, BAND_GOOD - 1, BAND_OK, BAND_OK - 1, 0].map(bandOf)).toEqual(["good", "good", "ok", "ok", "poor", "poor"]);
    expect(bandOf(null)).toBe("unknown");
  });
});

describe("wordViews: expected vs spoken", () => {
  it("a good take: every phoneme matches, spoken equals expected", () => {
    const views = wordViews(good());
    expect(views.map((v) => v.word)).toEqual(["I", "need", "a", "pen"]);
    for (const v of views) {
      expect(v.spokenIpa).toBe(v.expectedIpa);
      expect(v.phonemes.every((p) => p.matches)).toBe(true);
      expect(v.finalIssues).toEqual([]);
    }
    expect(views[1].expectedIpa).toBe("nid");
    expect(views[1].phonemes.map((p) => p.band)).toEqual(["good", "good", "good"]);
  });

  it("the missed final n: expected n, heard the schwa Azure's best candidate says", () => {
    const pen = wordViews(bad())[3];
    expect(pen.expectedIpa).toBe("pɛn");
    expect(pen.spokenIpa).toBe("pɛə");
    const n = pen.phonemes[2];
    expect(n).toMatchObject({ expected: "n", spoken: "ə", spokenScore: 100, accuracy: 0, band: "poor", matches: false, isConsonant: true, isFinal: true });
    expect(pen.phonemes[1]).toMatchObject({ expected: "ɛ", spoken: "ɛ", band: "ok", isFinal: false, isConsonant: false });
    expect(pen.band).toBe("poor");
  });

  it("uses the highest-scoring candidate even when the list is out of order", () => {
    const a = good();
    a.words[1].phonemes[0].nbest = [
      { ipa: "m", score: 20 },
      { ipa: "n", score: 99 },
    ];
    expect(wordViews(a)[1].phonemes[0].spoken).toBe("n");
  });

  it("copes with missing candidates and scores", () => {
    const a = good();
    a.words[1].phonemes[0].nbest = [];
    a.words[1].phonemes[1].nbest = [];
    a.words[1].phonemes[1].accuracy = 30;
    a.words[1].phonemes[2].accuracy = null;
    a.words[1].phonemes[2].nbest = [];
    const v = wordViews(a)[1].phonemes;
    expect(v[0]).toMatchObject({ spoken: "n", matches: true }); // accuracy 99, no candidates: taken as said
    expect(v[1]).toMatchObject({ spoken: null, matches: false }); // low score, no candidates: unknown
    expect(v[2]).toMatchObject({ spoken: null, band: "unknown" });
    expect(wordViews(a)[1].spokenIpa).toBe("n?" + "?");
  });

  it("normalises both sides, so g vs ɡ is never a false error", () => {
    const a = good();
    a.words[3].phonemes[0] = { ...a.words[3].phonemes[0], ipa: "g", nbest: [{ ipa: "ɡ", score: 97 }] };
    const p = wordViews(a)[3].phonemes[0];
    expect(p.expected).toBe("ɡ");
    expect(p.spoken).toBe("ɡ");
    expect(p.matches).toBe(true);
  });
});

describe("dropped or weak final consonants", () => {
  it("flags the missed n in 'pen' with a bilingual message", () => {
    const issues = findFinalConsonantIssues(bad());
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ wordIndex: 3, word: "pen", phoneme: "n", kind: "dropped", accuracy: 0, heardAs: "ə" });
    expect(issues[0].message.en).toBe("You didn't pronounce the final /n/ in “pen”. Say the last sound too, even if it is quiet.");
    expect(issues[0].message.th).toContain("/n/");
    expect(issues[0].message.th).toContain("pen");
    expect(wordViews(bad())[3].finalIssues).toEqual(issues);
  });

  it("finds nothing in the good take", () => {
    expect(findFinalConsonantIssues(good())).toEqual([]);
  });

  it("ignores a low score on a vowel (the final sound of 'a' or a final schwa)", () => {
    const a = good();
    a.words[2].phonemes[0].accuracy = 0;
    expect(findFinalConsonantIssues(a)).toEqual([]);
  });

  it("ignores a weak consonant that is not final", () => {
    const a = good();
    a.words[1].phonemes[0].accuracy = 0; // the n of "need"
    expect(findFinalConsonantIssues(a)).toEqual([]);
  });

  it("separates dropped (<= 20) from very weak (< 50) and lets 50 and above pass", () => {
    const at = (accuracy: number) => {
      const a = good();
      a.words[1].phonemes[2].accuracy = accuracy; // the d of "need"
      return findFinalConsonantIssues(a);
    };
    expect(at(FINAL_DROPPED_MAX)[0].kind).toBe("dropped");
    expect(at(FINAL_DROPPED_MAX + 1)[0].kind).toBe("weak");
    expect(at(FINAL_WEAK_MAX - 1)[0].kind).toBe("weak");
    expect(at(FINAL_WEAK_MAX)).toEqual([]);
    const weak = at(35)[0];
    expect(weak.message.en).toBe("The final /d/ in “need” was very weak. Say it a little clearer.");
    expect(weak.heardAs).toBeNull(); // Azure's best candidate was still d
    expect(weak.message.th).toContain("/d/");
  });

  it("does not treat a one-phoneme word as having a final consonant, and skips unscored phonemes", () => {
    const a = good();
    a.words[1].phonemes = [{ ...a.words[1].phonemes[0], accuracy: 0 }];
    expect(findFinalConsonantIssues(a)).toEqual([]);
    const b = good();
    b.words[1].phonemes[2].accuracy = null;
    expect(findFinalConsonantIssues(b)).toEqual([]);
  });

  it("strips punctuation from the word in the message", () => {
    const a = bad();
    a.words[3].word = "pen.";
    expect(findFinalConsonantIssues(a)[0].message.en).toContain("“pen”");
  });
});

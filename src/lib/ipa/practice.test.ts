import { describe, expect, it } from "vitest";
import { classIpa } from "./notation.ts";
import { decoysFor, focusQuery, gradeIpa, parseFocus, parseIpa, pickRoundWords, practiceWords, seededRandom, SYMBOLS, tileBank } from "./practice.ts";

const words = practiceWords();
const byWord = Object.fromEntries(words.map((w) => [w.word, w]));

describe("IPA practice words", () => {
  it("builds every word from the generated CMUdict table, in the app's symbol set", () => {
    expect(words.length).toBeGreaterThanOrEqual(20);
    for (const w of words) {
      expect(w.tokens.every((t) => SYMBOLS.includes(t)), `${w.word}: ${w.tokens.join(" ")}`).toBe(true);
      expect(w.th.length).toBeGreaterThan(0);
    }
  });

  it("puts the stress mark before the stressed syllable of longer words only", () => {
    expect(byWord.student.display).toBe("/ˈstudənt/");
    expect(byWord.vegetable.tokens).toEqual(["ˈ", "v", "ɛ", "dʒ", "t", "ə", "b", "ə", "l"]);
    expect(byWord.book.display).toBe("/bʊk/");
    expect(byWord.cheap.tokens).toEqual(["tʃ", "i", "p"]); // affricate = one tile
    expect(byWord.name.tokens).toEqual(["n", "eɪ", "m"]); // diphthong = one tile
  });

  it("uses the class's notation: r, ər and ɜr (no ɹ, ɚ or ɝ anywhere)", () => {
    expect(byWord.right.display).toBe("/raɪt/");
    expect(byWord.three.display).toBe("/θri/");
    expect(byWord.mother.display).toBe("/ˈmʌðər/");
    expect(byWord.water.display).toBe("/ˈwɔtər/");
    expect(byWord.bird.display).toBe("/bɜrd/");
    expect(byWord.world.tokens).toEqual(["w", "ɜ", "r", "l", "d"]);
    for (const old of ["ɹ", "ɚ", "ɝ"]) {
      expect(SYMBOLS).not.toContain(old);
      expect(words.some((w) => w.display.includes(old))).toBe(false);
    }
    expect(classIpa("ˈmɪ.ɹɚ")).toBe("ˈmɪ.rər");
  });
});

describe("tile bank", () => {
  it("adds decoys that Thai learners confuse with the word's sounds, never the word's own symbols", () => {
    const rand = seededRandom(7);
    for (const w of words) {
      const d = decoysFor(w.tokens, rand);
      expect(d.length).toBeGreaterThanOrEqual(2);
      expect(d.some((x) => w.tokens.includes(x))).toBe(false);
      expect(d).not.toContain("ˈ");
    }
    expect(decoysFor(byWord.think.tokens, seededRandom(1))).toEqual(expect.arrayContaining(["t"]));
  });

  it("contains every answer tile exactly as often as the answer needs it", () => {
    const bank = tileBank(byWord.vegetable, seededRandom(3));
    const count = (a: string[], s: string) => a.filter((x) => x === s).length;
    for (const s of byWord.vegetable.tokens) expect(count(bank, s)).toBeGreaterThanOrEqual(count(byWord.vegetable.tokens, s));
  });
});

describe("grading", () => {
  const g = (word: string, typed: string) => gradeIpa(byWord[word].tokens, parseIpa(typed));

  it("Perfect for the exact answer, and for textbook notation variants", () => {
    expect(g("student", "ˈstudənt").grade).toBe("perfect");
    expect(g("student", "/ˈstuːdənt/").grade).toBe("perfect");
    expect(g("right", "raɪt").grade).toBe("perfect");
    expect(g("right", "ɹaɪt").grade).toBe("perfect"); // the turned r is accepted, shown as r
    expect(g("bird", "bɜrd").grade).toBe("perfect");
    expect(g("bird", "bɜːrd").grade).toBe("perfect");
    expect(g("bird", "bɝd").grade).toBe("perfect"); // hooked forms are accepted, shown as ɜr / ər
    expect(g("mother", "ˈmʌðɚ").grade).toBe("perfect");
    expect(g("water", "ˈwɔːtər").grade).toBe("perfect");
    expect(g("boat", "bəʊt").grade).toBe("perfect");
    expect(g("table", "ˈteɪbl̩").grade).toBe("perfect");
    expect(g("job", "ʤɑb").grade).toBe("perfect");
  });

  it("reads handwriting conventions: small capital I is ɪ, small capital U is ʊ, other capitals are lowercase", () => {
    expect(g("rains", "reINZ").grade).toBe("perfect");
    expect(g("rains", "reINS").message?.en).toMatch(/sounds like z/); // read correctly, but s is the wrong sound
    expect(g("book", "bUk").grade).toBe("perfect");
    expect(g("bird", "b3rd").grade).toBe("perfect");
    expect(g("ship", "SIP").message?.en).toMatch(/^ʃ/); // S is s, not ʃ: a real mistake
  });

  it("asks for the r that American English pronounces (British /bɜːd/ misses it)", () => {
    const r = g("bird", "bɜːd");
    expect(r.grade).toBe("miss");
    expect(r.message?.en).toMatch(/^In American English every r is pronounced/);
  });

  it("Good when only the stress mark is missing", () => {
    const r = g("very", "vɛɹi");
    expect(r.grade).toBe("good");
    expect(r.message?.en).toMatch(/ˈ/);
  });

  it("explains the classic Thai mix-ups", () => {
    expect(g("think", "tɪŋk").message?.en).toMatch(/^θ \(think\)/);
    expect(g("very", "ˈwɛɹi").message?.en).toMatch(/^v \(very\)/);
    expect(g("rains", "ɹeɪns").message?.en).toMatch(/sounds like z/);
    expect(g("ship", "ʃip").message?.en).toMatch(/^ɪ \(ship\)/);
    expect(g("cat", "kɛt").message?.en).toMatch(/^æ/);
    expect(g("cheap", "ʃip").message?.en).toMatch(/tʃ/);
  });

  it("marks the wrong symbols and says when a sound is missing or extra", () => {
    const r = g("think", "tɪŋk");
    expect([...r.badGot]).toEqual([0]);
    expect(g("bus", "bʌ").message?.en).toMatch(/^A sound is missing: s/);
    expect(g("cup", "kʌpə").message?.en).toMatch(/^There's an extra sound: ə/);
  });
});

describe("tile sounds", () => {
  it("has a key word for every tile symbol, with the sound's letters marked", async () => {
    const { IPA_SOUNDS, keyWordParts, soundOf } = await import("./sounds.ts");
    for (const sym of SYMBOLS) expect(soundOf(sym), sym).toBeDefined();
    expect(keyWordParts(IPA_SOUNDS["θ"])).toEqual(["", "th", "ink"]);
    expect(keyWordParts(IPA_SOUNDS["ŋ"])).toEqual(["si", "ng", ""]);
    const ids = Object.values(IPA_SOUNDS).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length); // one file per symbol
    expect(ids.every((id) => /^[a-z-]+$/.test(id))).toBe(true);
  });
});

describe("focus rounds (/ipa?focus=θ,z)", () => {
  const FOCUS = ["θ", "z", "ʒ"];
  const hasFocus = (w: { tokens: string[] }) => w.tokens.some((t) => FOCUS.includes(t));

  it("parses known sounds only, once each, in the class's notation", () => {
    expect(parseFocus("θ,z")).toEqual(["θ", "z"]);
    expect(parseFocus(" θ , z ,θ")).toEqual(["θ", "z"]);
    expect(parseFocus("ɹ,g,ˈ,xyz,")).toEqual(["r", "ɡ"]);
    expect(parseFocus("")).toEqual([]);
    expect(parseFocus(null)).toEqual([]);
    expect(focusQuery(["θ", "ˈ", "z", "??"])).toBe("θ,z");
    expect(parseFocus(focusQuery(["θ", "z"]))).toEqual(["θ", "z"]);
  });

  it("without focus a round is just shuffled words, all different", () => {
    const round = pickRoundWords(words, 8, seededRandom(5));
    expect(round.length).toBe(8);
    expect(new Set(round.map((w) => w.word)).size).toBe(8);
  });

  it("covers every focus sound, then fills with more focus words, then the rest", () => {
    const withFocus = words.filter(hasFocus).length;
    for (let seed = 1; seed <= 20; seed++) {
      const round = pickRoundWords(words, 8, seededRandom(seed), FOCUS);
      expect(round.length).toBe(8);
      expect(new Set(round.map((w) => w.word)).size).toBe(8);
      for (const sym of FOCUS) expect(round.some((w) => w.tokens.includes(sym))).toBe(true);
      expect(round.filter(hasFocus).length).toBe(Math.min(8, withFocus));
    }
  });

  it("a sound no word has is ignored; a round never asks for more words than exist", () => {
    expect(pickRoundWords(words, 8, seededRandom(2), ["ɔɪ"]).length).toBe(8);
    expect(pickRoundWords(words, 999, seededRandom(2), ["θ"]).length).toBe(words.length);
  });
});

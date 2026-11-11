import { describe, expect, it } from "vitest";
import { contentKeys, loadLesson } from "../learn/content.ts";
import type { Sentence } from "../intonation/types.ts";
import { FLAT_LIMITS, flatGate, hasRealVariants, parseVariantManifest, variantSentence, variantsToMake, variantUrl } from "./variants.ts";

const all: Sentence[] = contentKeys().flatMap((k) => {
  const [u, l] = k.split("/");
  return loadLesson(u, l)?.sentences ?? [];
});
const find = (id: string) => all.find((s) => s.id === id)!;
const countSyllables = (x: Sentence) => x.groups.flatMap((g) => g.words.flatMap((w) => w.syllables)).length;

describe("variant sentences", () => {
  it("keeps the sentence itself when the variant is its textbook ending", () => {
    const falling = find("falling-1-book-table");
    expect(variantSentence(falling, "falling")).toBe(falling);
    const yesno = all.find((s) => s.groups.at(-1)!.pattern === "2-3")!;
    expect(variantSentence(yesno, "rising")).toBe(yesno);
  });

  it("re-tunes the last group for the other ending, keeping words and nucleus", () => {
    const s = find("falling-1-book-table");
    const rising = variantSentence(s, "rising")!;
    expect(rising.groups.at(-1)!.pattern).toBe("2-3");
    expect(rising.groups.at(-1)!.words.map((w) => w.text)).toEqual(s.groups.at(-1)!.words.map((w) => w.text));
    expect(rising.groups.at(-1)!.nucleus).toEqual(s.groups.at(-1)!.nucleus);
    const yesno = all.find((s2) => s2.groups.at(-1)!.pattern === "2-3")!;
    expect(variantSentence(yesno, "falling")!.groups.at(-1)!.pattern).toBe("2-3-1");
  });

  it("every syllable of a flat variant is at level 2, and busy has no real clip", () => {
    const flat = variantSentence(find("falling-1-book-table"), "flat")!;
    for (const g of flat.groups) for (const w of g.words) for (const y of w.syllables) expect(y.levels).toEqual([2]);
    expect(variantSentence(find("falling-1-book-table"), "busy")).toBeNull();
  });

  it("finished makes every group fall, and is only made when some group is open", () => {
    const open = all.find((s) => s.groups.length > 1 && s.groups[0].pattern === "2-3-2")!;
    expect(variantSentence(open, "finished")!.groups.every((g) => g.pattern === "2-3-1" || g.pattern === "3-1")).toBe(true);
    expect(variantsToMake(open)).toContain("finished");
    expect(variantsToMake(find("falling-1-book-table"))).not.toContain("finished");
  });

  it("never changes the number of syllables, and gives a level to each", () => {
    for (const s of all) {
      for (const v of variantsToMake(s)) {
        const out = variantSentence(s, v)!;
        expect(countSyllables(out)).toBe(countSyllables(s));
        for (const g of out.groups) for (const w of g.words) for (const y of w.syllables) expect(y.levels.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("variant manifest", () => {
  it("reads leniently and checks that every needed variant exists", () => {
    const m = parseVariantManifest({ clips: { a: ["falling", "rising", "weird"], b: "x", c: [] } });
    expect(m.clips).toEqual({ a: ["falling", "rising"] });
    expect(hasRealVariants(m, "a", ["falling", "rising"])).toBe(true);
    expect(hasRealVariants(m, "a", ["falling", "flat"])).toBe(false);
    expect(hasRealVariants(m, "zzz", ["falling"])).toBe(false);
    expect(parseVariantManifest(null).clips).toEqual({});
    expect(variantUrl("x", "flat")).toBe("/audio/variants/x--flat.mp3");
  });
});

describe("flat gate", () => {
  const tone = (f0: (t: number) => number, sec = 1.2, sr = 24000) => {
    const out = new Float32Array(Math.round(sec * sr));
    let phase = 0;
    for (let i = 0; i < out.length; i++) {
      phase += (2 * Math.PI * f0(i / sr)) / sr;
      out[i] = 0.5 * Math.sin(phase) + 0.25 * Math.sin(2 * phase);
    }
    return out;
  };

  it("passes a steady voice and fails one that rises or falls at the end", () => {
    expect(flatGate(tone(() => 150), 24000).pass).toBe(true);
    const rising = flatGate(tone((t) => (t < 0.8 ? 150 : 150 * 2 ** (((t - 0.8) / 0.4) * (5 / 12)))), 24000);
    expect(rising.pass).toBe(false);
    expect(rising.endSt!).toBeGreaterThan(FLAT_LIMITS.endSt);
    const falling = flatGate(tone((t) => 180 * 2 ** (-(t / 1.2) * (7 / 12))), 24000);
    expect(falling.pass).toBe(false);
  });

  it("fails silence", () => {
    expect(flatGate(new Float32Array(24000), 24000).pass).toBe(false);
  });
});

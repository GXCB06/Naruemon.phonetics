import { describe, expect, it } from "vitest";
import { endingFor, GROUP_GAP_SEC, karaokeTimeline, LEAD_IN_SEC, SEC_PER_SYLLABLE, wordState } from "./karaoke.ts";
import { getSentence, SENTENCES } from "./lessons.ts";

describe("karaokeTimeline", () => {
  it("spends ~0.32 s per syllable, one word after another", () => {
    const s = getSentence("fall-pretty-woman")!; // She is a pre-tty wo-man  → 7 syllables
    const tl = karaokeTimeline(s, { leadInSec: 0 });
    expect(tl.words.map((w) => w.syllables)).toEqual([1, 1, 1, 2, 2]);
    expect(tl.words[0].startSec).toBe(0);
    expect(tl.words[3].startSec).toBeCloseTo(3 * SEC_PER_SYLLABLE, 6);
    expect(tl.words[4].endSec).toBeCloseTo(7 * SEC_PER_SYLLABLE, 6);
    for (let i = 1; i < tl.words.length; i++) expect(tl.words[i].startSec).toBeCloseTo(tl.words[i - 1].endSec, 6);
    expect(tl.totalSec).toBeCloseTo(7 * SEC_PER_SYLLABLE, 6);
  });

  it("marks the nucleus word of each thought group", () => {
    const s = getSentence("fall-pretty-woman")!;
    const tl = karaokeTimeline(s);
    expect(tl.words.filter((w) => w.isNucleus).map((w) => w.text)).toEqual(["woman."]);
    expect(tl.groups[0].nucleusWord).toBe(4);
  });

  it("adds a small gap at thought-group breaks and finds a nucleus in each group", () => {
    const s = getSentence("nonfinal-rains-bus")!;
    const tl = karaokeTimeline(s, { leadInSec: 0 });
    expect(tl.groups).toHaveLength(2);
    expect(tl.groups[1].startSec - tl.groups[0].endSec).toBeCloseTo(GROUP_GAP_SEC, 6);
    expect(tl.words.filter((w) => w.isNucleus).map((w) => w.text)).toEqual(["rains,", "bus."]);
    expect(tl.groups[0].nucleusWord).toBe(2);
    expect(tl.groups[1].nucleusWord).toBe(3 + 4);
  });

  it("starts after a short lead-in by default", () => {
    const tl = karaokeTimeline(getSentence("fall-pretty-woman")!);
    expect(tl.words[0].startSec).toBeCloseTo(LEAD_IN_SEC, 6);
  });

  it("works for every lesson sentence", () => {
    for (const s of SENTENCES) {
      const tl = karaokeTimeline(s);
      expect(tl.groups.length).toBe(s.groups.length);
      expect(tl.words.filter((w) => w.isNucleus).length).toBe(s.groups.length);
      expect(tl.totalSec).toBeGreaterThan(1);
    }
  });
});

describe("endingFor", () => {
  it("2-3-1 and 3-1 fall, 2-3-2 comes back to mid, 2-3 rises", () => {
    expect(endingFor("2-3-1")).toMatchObject({ kind: "fall", arrow: "↘" });
    expect(endingFor("3-1")).toMatchObject({ kind: "fall", arrow: "↘" });
    expect(endingFor("2-3-2")).toMatchObject({ kind: "midback", arrow: "↘" });
    expect(endingFor("2-3")).toMatchObject({ kind: "rise", arrow: "↗" });
  });

  it("has English and Thai captions", () => {
    for (const p of ["2-3-1", "2-3-2", "2-3", "3-1"] as const) {
      const c = endingFor(p).caption;
      expect(c.en.length).toBeGreaterThan(0);
      expect(c.th.length).toBeGreaterThan(0);
    }
  });
});

describe("wordState", () => {
  it("is upcoming, active, then done", () => {
    const w = { startSec: 1, endSec: 2 };
    expect(wordState(w, 0.5)).toBe("upcoming");
    expect(wordState(w, 1)).toBe("active");
    expect(wordState(w, 1.99)).toBe("active");
    expect(wordState(w, 2)).toBe("done");
  });
});

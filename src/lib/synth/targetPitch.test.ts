import { describe, expect, it } from "vitest";
import { contentKeys, loadLesson } from "../learn/content.ts";
import type { Sentence } from "../intonation/types.ts";
import { levelToHz, syllablePlan, targetLine } from "./targetPitch.ts";
import { variantSentence } from "./variants.ts";

const all: Sentence[] = contentKeys().flatMap((k) => {
  const [u, l] = k.split("/");
  return loadLesson(u, l)?.sentences ?? [];
});
const sentence = all.find((s) => s.id === "falling-1-book-table")!; // "The book is on my table." 2-3-1, nucleus TA- of table

/** Evenly spoken words, 0.3 s each. */
const spokenFor = (s: Sentence) => s.groups.flatMap((g) => g.words).map((w, i) => ({ text: w.text, offsetSec: 0.2 + i * 0.35, durationSec: 0.3 }));

describe("target pitch line", () => {
  it("maps levels to Hz around the baseline, 4 semitones a level", () => {
    expect(levelToHz(2, 150)).toBeCloseTo(150);
    expect(levelToHz(3, 150)).toBeCloseTo(150 * 2 ** (4 / 12));
    expect(levelToHz(1, 150)).toBeCloseTo(150 * 2 ** (-4 / 12));
  });

  it("gives every syllable of every spoken word an interval inside its word", () => {
    const spoken = spokenFor(sentence);
    const plan = syllablePlan(sentence, spoken);
    expect(plan.length).toBe(sentence.groups.flatMap((g) => g.words.flatMap((w) => w.syllables)).length);
    for (const p of plan) expect(p.t1).toBeGreaterThan(p.t0);
    for (let i = 1; i < plan.length; i++) expect(plan[i].t0).toBeGreaterThanOrEqual(plan[i - 1].t1 - 1e-9);
  });

  it("peaks on the nucleus of a falling sentence and ends low", () => {
    const line = targetLine(syllablePlan(sentence, spokenFor(sentence)), 150);
    const plan = syllablePlan(sentence, spokenFor(sentence));
    // "table" = TA- (level 3), -BLE (level 1)
    const syl = plan.slice(-2);
    const mid = (p: { t0: number; t1: number }) => (p.t0 + p.t1) / 2;
    expect(line(mid(syl[0]))).toBeCloseTo(levelToHz(3, 150), 0);
    expect(line(mid(syl[1]))).toBeCloseTo(levelToHz(1, 150), 0);
    expect(line(0)).toBeCloseTo(levelToHz(2, 150), 0); // held before the first word
    expect(line(99)).toBeCloseTo(levelToHz(1, 150), 0); // held after the last
  });

  it("makes the other tunes from the same timing: rising ends high, flat stays at the baseline", () => {
    const spoken = spokenFor(sentence);
    const rising = variantSentence(sentence, "rising")!;
    const rl = targetLine(syllablePlan(rising, spoken), 150);
    expect(rl(99)).toBeGreaterThan(150 * 2 ** (3 / 12));
    const flat = variantSentence(sentence, "flat")!;
    const fl = targetLine(syllablePlan(flat, spoken), 150);
    for (const t of [0.1, 0.8, 1.6, 2.4, 99]) expect(fl(t)).toBeCloseTo(150, 5);
  });

  it("skips a word that was not spoken and still gives a continuous line", () => {
    const spoken = spokenFor(sentence).filter((w) => w.text !== "is");
    const plan = syllablePlan(sentence, spoken);
    expect(plan.length).toBe(sentence.groups.flatMap((g) => g.words.flatMap((w) => w.syllables)).length - 1);
    const line = targetLine(plan, 150);
    for (let t = 0; t < 3; t += 0.05) expect(Number.isFinite(line(t))).toBe(true);
  });

  it("cuts a word to its voiced part, so a falling tune does not fall after the voice stopped", () => {
    // "work": reported 0.3 s to 0.8 s, but only voiced from 0.3 s to 0.55 s (the k and the pause are silent)
    const work = all.find((x) => x.id === "falling-2-where-going") ?? sentence;
    void work;
    const one = { ...sentence, groups: [{ ...sentence.groups[0], words: sentence.groups[0].words.slice(-1), nucleus: { word: 0, syllable: 0 } }] };
    const word = one.groups[0].words[0]; // "table"
    const spoken = [{ text: word.text, offsetSec: 0.3, durationSec: 0.5 }];
    const frames = Array.from({ length: 26 }, (_, i) => ({ time: 0.3 + i * 0.01, hz: 150, clarity: 1, rms: 0.1 }));
    const whole = syllablePlan(one, spoken);
    const cut = syllablePlan(one, spoken, frames);
    expect(whole[whole.length - 1].t1).toBeCloseTo(0.8, 5);
    expect(cut[cut.length - 1].t1).toBeLessThan(0.6);
    expect(cut[0].t0).toBeGreaterThanOrEqual(0.29);
    // too little voice: the whole word is kept
    expect(syllablePlan(one, spoken, frames.slice(0, 2))[0].t0).toBeCloseTo(0.3, 5);
  });

  it("falls back to the baseline when no word was spoken", () => {
    expect(targetLine(syllablePlan(sentence, []), 140)(1)).toBe(140);
  });

  it("works for every course sentence and variant", () => {
    for (const s of all) for (const v of ["falling", "rising", "flat"] as const) {
      const vs = variantSentence(s, v)!;
      const line = targetLine(syllablePlan(vs, spokenFor(vs)), 150);
      for (const t of [0, 0.5, 1.5, 3]) {
        const hz = line(t);
        expect(hz).toBeGreaterThan(80);
        expect(hz).toBeLessThan(260);
      }
    }
  });
});

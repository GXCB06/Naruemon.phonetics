import { describe, expect, it } from "vitest";
import { analyzeVoice } from "../audio/analyzeVoice.ts";
import { analyze } from "../intonation/engine.ts";
import { layoutSentence, targetContour } from "../intonation/contour.ts";
import type { Sentence } from "../intonation/types.ts";
import { completeLesson, emptyProgress } from "../progress/store.ts";
import { loadLesson } from "./content.ts";
import { analysisFeedback, hearFeedback, peakFeedback, peakLabel } from "./feedback.ts";
import { PLAN, buildExercises, endingOf, distractorFor, hasBusyVariant, listeningFallback, makeHear } from "./exercises.ts";
import type { HearExercise } from "./exercises.ts";
import { placeholderClip, referenceUrl } from "./reference.ts";
import { PASS_SCORE, graded, rightWrong, summarize, xpFor } from "./score.ts";

const lesson = (id: string) => loadLesson("falling", id)!;
const sentenceOf = (lessonId: string, id: string): Sentence => lesson(lessonId).sentences.find((s) => s.id === id)!;

describe("buildExercises", () => {
  it("makes 10 to 12 exercises, listening first, in a fixed type order", () => {
    for (const id of ["falling-1", "falling-2", "falling-3"]) {
      const ex = buildExercises(lesson(id).sentences, id);
      expect(ex.length).toBeGreaterThanOrEqual(10);
      expect(ex.length).toBeLessThanOrEqual(12);
      expect(ex.map((e) => e.type)).toEqual([...PLAN]);
      expect(ex[0].type).toBe("hear");
      expect(ex.at(-1)!.type).toBe("shadow");
      expect(new Set(ex.map((e) => e.id)).size).toBe(ex.length);
    }
  });

  it("is deterministic and uses every sentence of the lesson", () => {
    for (const id of ["falling-1", "falling-2", "falling-3"]) {
      const sentences = lesson(id).sentences;
      const a = buildExercises(sentences, id);
      expect(buildExercises(sentences, id)).toEqual(a);
      expect(new Set(a.map((e) => e.sentenceId))).toEqual(new Set(sentences.map((s) => s.id)));
    }
  });

  it("does not repeat a sentence in two consecutive exercises", () => {
    const ex = buildExercises(lesson("falling-1").sentences, "falling-1");
    ex.slice(1).forEach((e, i) => expect(e.sentenceId).not.toBe(ex[i].sentenceId));
  });

  it("needs at least one sentence", () => {
    expect(() => buildExercises([], "x")).toThrow(/no sentences/);
    expect(buildExercises(lesson("falling-1").sentences.slice(0, 1), "x")).toHaveLength(PLAN.length);
  });
});

describe("hear it", () => {
  const hears = (id: string) => buildExercises(lesson(id).sentences, id).filter((e): e is HearExercise => e.type === "hear");

  it("always has exactly one falling clip, at the index named by `correct`, and the answer moves around", () => {
    for (const id of ["falling-1", "falling-2", "falling-3"]) {
      const h = hears(id);
      for (const e of h) {
        expect(e.clips.filter((c) => c === "falling")).toHaveLength(1);
        expect(e.clips[e.correct]).toBe("falling");
      }
      expect(new Set(h.map((e) => e.correct)).size).toBe(2);
      // which mistakes appear depends on which real-voice clips exist (a pair is real-voice when it can be)
      expect(new Set(h.flatMap((e) => e.clips.filter((c) => c !== "falling"))).size).toBeGreaterThanOrEqual(1);
    }
  });

  it("prefers a mistake that has a real-voice clip next to the target", async () => {
    const { default: manifest } = await import("../../../public/audio/variants/manifest.json", { with: { type: "json" } });
    const clips = (manifest as { clips: Record<string, string[]> }).clips;
    // a sentence with real falling + rising clips but no real flat clip: asking for the falling one must pair it with rising
    const all = ["falling-1", "falling-2", "falling-3"].flatMap((id) => lesson(id).sentences);
    const s = all.find((x) => clips[x.id]?.includes("falling") && clips[x.id]?.includes("rising") && !clips[x.id]?.includes("flat") && endingOf(x) === "falling");
    if (!s) return; // none in the committed clips: nothing to prove
    for (let k = 0; k < 4; k++) expect(makeHear(s, k, `t-${k}`).clips).toContain("rising");
  });

  it("never offers a 'busy' distractor that sounds the same as the falling clip", () => {
    const tea = sentenceOf("falling-1", "falling-1-drink-tea"); // only stressed syllable is the last one
    expect(hasBusyVariant(tea)).toBe(false);
    for (let k = 0; k < 6; k++) expect(distractorFor(tea, k)).not.toBe("busy");
    expect(hasBusyVariant(sentenceOf("falling-1", "falling-1-work-tomorrow"))).toBe(false); // only the nucleus is stressed
    expect(hasBusyVariant(sentenceOf("falling-1", "falling-1-situation"))).toBe(true); // "a" of situation is stressed too
  });

  it("the distractor clips really sound wrong to our own pipeline (so the exercise is fair)", () => {
    const s = sentenceOf("falling-1", "falling-1-situation");
    const ending = (variant: "falling" | "rising" | "flat" | "busy") => {
      const { samples, sampleRate } = placeholderClip(s, variant);
      const r = analyzeVoice(samples, sampleRate, s).result!;
      return { r, ending: r.groups[0].checks.find((c) => c.id === "ending")!.status, range: r.groups[0].checks.find((c) => c.id === "range")!.status };
    };
    const good = ending("falling");
    expect(good.r.overall).toBeGreaterThanOrEqual(75);
    expect(good.ending).toBe("pass");
    expect(ending("rising").ending).toBe("fail");
    expect(ending("flat").range).not.toBe("pass");
    const busy = ending("busy").r;
    expect(busy.overall).toBeLessThan(good.r.overall);
    expect(busy.groups[0].checks.find((c) => c.id === "singlePeak")!.status).not.toBe("pass");
  });

  it("falls back to a listening exercise when there is no microphone", () => {
    const shadow = buildExercises(lesson("falling-2").sentences, "falling-2").find((e) => e.type === "shadow")!;
    if (shadow.type !== "shadow") throw new Error("expected shadow");
    const s = sentenceOf("falling-2", shadow.sentenceId);
    const swap = listeningFallback(shadow, s);
    expect(swap.type).toBe("hear");
    expect(swap.sentenceId).toBe(shadow.sentenceId);
    expect(swap.clips[swap.correct]).toBe("falling");
    expect(swap.id).not.toBe(shadow.id);
    expect(makeHear(s, 0, "x").correct).toBe(1);
  });
});

describe("placeholder reference voice", () => {
  it("names the audio file the real clips will use", () => {
    expect(referenceUrl("falling-1-notebook")).toBe("/audio/falling-1-notebook--f.mp3");
    expect(referenceUrl("falling-1-notebook", "m")).toBe("/audio/falling-1-notebook--m.mp3");
  });

  it("every lesson sentence synthesises to audible, non-empty audio", () => {
    for (const id of ["falling-1", "falling-2", "falling-3"]) {
      for (const s of lesson(id).sentences) {
        const { samples, sampleRate } = placeholderClip(s);
        expect(sampleRate).toBeGreaterThan(8000);
        expect(samples.length).toBeGreaterThan(sampleRate * 0.5);
        let peak = 0;
        for (const v of samples) peak = Math.max(peak, Math.abs(v));
        expect(peak).toBeGreaterThan(0.01);
      }
    }
  });
});

describe("feedback", () => {
  it("is bilingual everywhere", () => {
    const s = sentenceOf("falling-1", "falling-1-book-table");
    const all = [
      hearFeedback(true, "rising"),
      hearFeedback(false, "rising"),
      hearFeedback(true, "flat"),
      hearFeedback(false, "flat"),
      hearFeedback(true, "busy"),
      hearFeedback(false, "busy"),
      peakFeedback(true, s),
      peakFeedback(false, s),
    ];
    for (const f of all) {
      expect(f.title.en.length).toBeGreaterThan(0);
      expect(f.title.th.length).toBeGreaterThan(0);
      expect(f.detail.en.length).toBeGreaterThan(0);
      expect(f.detail.th.length).toBeGreaterThan(0);
      expect(f.title.en).toBe(f.passed ? "Nice!" : "Almost");
    }
  });

  it("names the syllable that carries the peak", () => {
    expect(peakLabel(sentenceOf("falling-1", "falling-1-book-table"))).toBe("TA-");
    expect(peakLabel(sentenceOf("falling-2", "falling-2-what-name"))).toBe("NAME");
    expect(peakFeedback(false, sentenceOf("falling-2", "falling-2-when-arrive")).detail.en).toContain("-RIVE");
  });

  it("draw/shadow feedback follows the rule engine: a perfect drawing is Nice, a monotone line is Almost with the range tip", () => {
    const s = sentenceOf("falling-2", "falling-2-what-name");
    const target = targetContour(layoutSentence(s));
    const perfect = analyze(s, target, { modality: "draw", timingKnown: true });
    expect(analysisFeedback(perfect).passed).toBe(true);
    expect(analysisFeedback(perfect).title.en).toBe("Nice!");

    const flat = analyze(s, target.map((p) => ({ t: p.t, v: p.v === null ? null : 2 })), { modality: "draw", timingKnown: true });
    const fb = analysisFeedback(flat);
    expect(fb.passed).toBe(false);
    expect(fb.title.en).toBe("Almost");
    expect(fb.detail.th.length).toBeGreaterThan(0);
  });
});

describe("a failed check is never 'Nice!'", () => {
  it("drawing the peak several syllables too early gives Almost with the placement tip, whatever the shape score", () => {
    const s = sentenceOf("falling-1", "falling-1-situation"); // nucleus is DIF- (index 6 of 9 syllables)
    const early = structuredClone(s);
    early.groups[0].words.flatMap((w) => w.syllables).forEach((y, i) => (y.levels = [i === 3 ? 3 : i < 3 ? 2 : 1]));
    const drawn = targetContour(layoutSentence(early));
    const r = analyze(s, drawn, { modality: "draw", timingKnown: true });
    const placement = r.groups[0].checks.find((c) => c.id === "peakPlacement")!;
    expect(placement.status).toBe("fail");
    const fb = analysisFeedback(r);
    expect(fb.passed).toBe(false);
    expect(fb.title.en).toBe("Almost");
    expect(fb.detail.en).toMatch(/too early/);
    expect(graded("x", "draw", r.overall, fb.passed).passed).toBe(false);
  });
});

describe("a warning on the peak or the ending is not 'Nice!' either", () => {
  it("a peak one syllable early (engine: warn) is Almost, not a green sheet with a 'too early' tip", () => {
    const s = sentenceOf("falling-1", "falling-1-situation");
    const early = structuredClone(s);
    early.groups[0].words.flatMap((w) => w.syllables).forEach((y, i) => (y.levels = [i === 5 ? 3 : i < 5 ? 2 : 1]));
    const r = analyze(s, targetContour(layoutSentence(early)), { modality: "draw", timingKnown: true });
    expect(r.groups[0].checks.find((c) => c.id === "peakPlacement")!.status).toBe("warn");
    expect(analysisFeedback(r).passed).toBe(false);
  });
});

describe("scoring", () => {
  it("right/wrong outcomes are 100 or 0; graded outcomes use the engine score and the pass mark", () => {
    expect(rightWrong("a", "hear", true)).toMatchObject({ score: 100, passed: true });
    expect(rightWrong("a", "peak", false)).toMatchObject({ score: 0, passed: false });
    expect(graded("a", "draw", PASS_SCORE)).toMatchObject({ score: PASS_SCORE, passed: true });
    expect(graded("a", "draw", PASS_SCORE - 1).passed).toBe(false);
    expect(graded("a", "shadow", 140).score).toBe(100);
    expect(graded("a", "shadow", Number.NaN).score).toBe(0);
    expect(graded("a", "draw", 95, false)).toMatchObject({ score: 95, passed: false });
  });

  it("XP: 10 for finishing, up to 20 for score, 5 for a clean sheet", () => {
    expect(xpFor(0, 0, 10)).toBe(10);
    expect(xpFor(100, 10, 10)).toBe(35);
    expect(xpFor(100, 9, 10)).toBe(30);
    expect(xpFor(50, 5, 10)).toBe(20);
  });

  it("summarises a lesson: mean score, stars, XP, passed count", () => {
    const perfect = Array.from({ length: 10 }, (_, i) => rightWrong(`e${i}`, "hear", true));
    expect(summarize(perfect)).toEqual({ score: 100, stars: 3, xp: 35, passed: 10, total: 10 });

    const mixed = [
      ...Array.from({ length: 6 }, (_, i) => rightWrong(`r${i}`, "hear", true)),
      ...Array.from({ length: 2 }, (_, i) => rightWrong(`w${i}`, "peak", false)),
      graded("d", "draw", 70),
      graded("s", "shadow", 80),
    ];
    const s = summarize(mixed);
    expect(s.score).toBe(Math.round((600 + 0 + 70 + 80) / 10));
    expect(s.passed).toBe(8);
    expect(s.stars).toBe(2);
    expect(s.xp).toBe(10 + Math.round(s.score / 5));

    expect(summarize([])).toEqual({ score: 0, stars: 0, xp: 0, passed: 0, total: 0 });
  });

  it("feeds the progress store: finishing a lesson adds the summary's XP and stars", () => {
    const sum = summarize(Array.from({ length: 10 }, (_, i) => rightWrong(`e${i}`, "hear", i < 9)));
    const p = completeLesson(emptyProgress(), "falling-1", { score: sum.score, xp: sum.xp });
    expect(p.xp).toBe(sum.xp);
    expect(p.lessons["falling-1"].stars).toBe(sum.stars);
    expect(p.lessons["falling-1"].best).toBe(90);
  });
});

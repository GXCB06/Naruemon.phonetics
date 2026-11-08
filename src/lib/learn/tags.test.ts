import { describe, expect, it } from "vitest";
import { analyzeVoice } from "../audio/analyzeVoice.ts";
import { UNITS } from "../course/units.ts";
import { levelsForFallingTag, levelsForPattern } from "../intonation/buildLesson.ts";
import { layoutSentence, targetContour } from "../intonation/contour.ts";
import { analyze } from "../intonation/engine.ts";
import { SENTENCES } from "../intonation/lessons.ts";
import type { Sentence } from "../intonation/types.ts";
import { loadLesson } from "./content.ts";
import { PLAN_BY_LESSON, buildExercises, endingOf, listeningFallback, makeHear } from "./exercises.ts";
import type { HearExercise } from "./exercises.ts";
import { analysisFeedback } from "./feedback.ts";
import {
  MEANING_CHOICES,
  endingOfReading,
  isTagSentence,
  meaningFeedback,
  otherReading,
  situationFor,
  tagHearFeedback,
  tagHearHint,
  tagHearQuestion,
  tagReading,
  tagReadingOf,
} from "./meaning.ts";
import { placeholderClip } from "./reference.ts";

const THAI = /[฀-๿]/;
const lesson = (id: string) => loadLesson("tags", id)!;
const IDS = ["tags-1", "tags-2", "tags-3"];
const all = IDS.flatMap((id) => lesson(id).sentences);
const levelsOf = (g: Sentence["groups"][number]) => g.words.flatMap((w) => w.syllables.map((s) => s.levels));

describe("tag level builders", () => {
  it("falling tag 3-1: the nucleus is 3, everything after it 1; a last-syllable nucleus glides 3 to 1", () => {
    expect(levelsForFallingTag(3, 0)).toEqual([[3], [1], [1]]); // isn't he
    expect(levelsForFallingTag(2, 0)).toEqual([[3], [1]]); // won't she
    expect(levelsForFallingTag(1, 0)).toEqual([[3, 1]]);
    expect(levelsForFallingTag(3, 2)).toEqual([[3], [3], [3, 1]]);
    expect(() => levelsForFallingTag(2, 2)).toThrow();
    expect(() => levelsForFallingTag(0, 0)).toThrow();
  });

  it("levelsForPattern picks the builder for the pattern", () => {
    expect(levelsForPattern("3-1", 3, 0)).toEqual(levelsForFallingTag(3, 0));
    expect(levelsForPattern("2-3", 2, 0)).toEqual([[2, 3], [3, 3.4]]);
    expect(levelsForPattern("2-3-1", 3, 1)).toEqual([[2], [3], [1]]);
    expect(() => levelsForPattern("2-3-2", 3, 1)).toThrow();
  });
});

describe("tags content", () => {
  it("has 4, 4 and 6 sentences, each a statement group plus a tag group", () => {
    expect(IDS.map((id) => lesson(id).sentences.length)).toEqual([4, 4, 6]);
    for (const s of all) {
      expect(s.groups, s.id).toHaveLength(2);
      expect(s.groups[0].pattern, s.id).toBe("2-3-1");
      expect(isTagSentence(s), s.id).toBe(true);
      expect(s.kind).toMatch(/^Tag question/);
      expect(s.note.en.length).toBeGreaterThan(20);
      expect(s.note.th).toMatch(THAI);
    }
  });

  it("tags 1 falls (3-1) and tags 2 rises (2-3) on the same four sentences", () => {
    const sure = lesson("tags-1").sentences;
    const unsure = lesson("tags-2").sentences;
    expect(sure.map((s) => s.text)).toEqual(unsure.map((s) => s.text));
    expect(sure.map((s) => s.text)).toEqual([
      "Harry is coming, isn't he?",
      "He is always late, isn't he?",
      "Susan will help me with this work, won't she?",
      "You are not hungry, are you?",
    ]);
    for (const s of sure) expect(s.groups[1].pattern, s.id).toBe("3-1");
    for (const s of unsure) expect(s.groups[1].pattern, s.id).toBe("2-3");
    expect(sure.map((s) => s.id)).not.toEqual(unsure.map((s) => s.id));
  });

  it("tags 3 mixes both readings, three each", () => {
    const readings = lesson("tags-3").sentences.map((s) => tagReadingOf(s));
    expect(readings.filter((r) => r === "sure")).toHaveLength(3);
    expect(readings.filter((r) => r === "unsure")).toHaveLength(3);
  });

  it("a sure tag starts high on the stressed auxiliary and falls to 1; a not-sure tag starts at 2, reaches 3 and stays up", () => {
    for (const s of all) {
      const tag = s.groups[1];
      const lv = levelsOf(tag);
      expect(tag.nucleus, s.id).toEqual({ word: 0, syllable: 0 });
      expect(tag.words[0].syllables[0].stressed, s.id).toBe(true);
      if (tag.pattern === "3-1") {
        expect(lv[0], s.id).toEqual([3]);
        for (const l of lv.slice(1)) expect(l, s.id).toEqual([1]);
      } else {
        expect(lv[0][0], s.id).toBe(2);
        expect(Math.max(...lv[0]), s.id).toBe(3);
        expect(lv.at(-1)!.at(-1)!, s.id).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("the generated target of every lesson sentence passes the rule engine with no failed check", () => {
    for (const s of all) {
      const target = targetContour(layoutSentence(s));
      const r = analyze(s, target, { modality: "draw", timingKnown: true });
      for (const g of r.groups) {
        for (const c of g.checks) expect(c.status, `${s.id} group ${g.groupIndex} ${c.id}`).not.toBe("fail");
        // the two checks this course is about must be clean; only "range" may warn on a long, mostly-level-2 statement
        for (const c of g.checks.filter((k) => k.id !== "range")) expect(c.status, `${s.id} group ${g.groupIndex} ${c.id}`).not.toBe("warn");
      }
      expect(r.overall, s.id).toBeGreaterThanOrEqual(85);
      expect(analysisFeedback(r).passed, s.id).toBe(true);
    }
  });

  it("the sure target is not good enough for the not-sure reading, and the other way round", () => {
    for (const s of lesson("tags-1").sentences) {
      const wrong = analyze(tagReading(s, "unsure"), targetContour(layoutSentence(s)), { modality: "draw", timingKnown: true });
      expect(wrong.groups[1].checks.find((c) => c.id === "ending")!.status, s.id).toBe("fail");
    }
    for (const s of lesson("tags-2").sentences) {
      const wrong = analyze(tagReading(s, "sure"), targetContour(layoutSentence(s)), { modality: "draw", timingKnown: true });
      expect(wrong.groups[1].checks.find((c) => c.id === "ending")!.status, s.id).toBe("fail");
    }
  });

  it("agrees with the hand-written tags in lessons.ts", () => {
    const sure = SENTENCES.find((s) => s.id === "tag-sure")!;
    const unsure = SENTENCES.find((s) => s.id === "tag-unsure")!;
    const harry = (id: string) => lesson(id).sentences[0];
    expect(harry("tags-1").groups.map(levelsOf)).toEqual(sure.groups.map(levelsOf));
    expect(harry("tags-2").groups.map(levelsOf)).toEqual(unsure.groups.map(levelsOf));
  });
});

describe("the course map", () => {
  it("unlocks the tags unit with its three lessons", () => {
    const u = UNITS.find((x) => x.id === "tags")!;
    expect(u.locked).toBe(false);
    expect(u.lessons.map((l) => l.id)).toEqual(IDS);
    for (const l of u.lessons) {
      expect(l.title.en.length).toBeGreaterThan(3);
      expect(l.title.th).toMatch(THAI);
    }
    expect(u.blurb.th).toMatch(THAI);
  });
});

describe("tagReading", () => {
  it("changes only the tag group and is its own inverse", () => {
    const s = lesson("tags-1").sentences[0];
    const flipped = tagReading(s, "unsure");
    expect(flipped.groups[0]).toEqual(s.groups[0]);
    expect(flipped.groups[1].pattern).toBe("2-3");
    expect(tagReadingOf(flipped)).toBe("unsure");
    expect(tagReading(flipped, "sure")).toEqual(s);
    expect(flipped.groups[1].words.map((w) => w.text)).toEqual(s.groups[1].words.map((w) => w.text));
    // and it matches what the build would have made for the not-sure lesson
    expect(flipped.groups).toEqual(lesson("tags-2").sentences[0].groups);
  });

  it("refuses a sentence that is not a tag question", () => {
    expect(() => tagReading(loadLesson("falling", "falling-1")!.sentences[0], "sure")).toThrow(/not a tag/);
    expect(tagReadingOf(loadLesson("rising", "rising-2")!.sentences[0])).toBeNull();
    expect(isTagSentence(loadLesson("falling", "falling-1")!.sentences[0])).toBe(false);
  });

  it("maps readings to endings", () => {
    expect(endingOfReading("sure")).toBe("falling");
    expect(endingOfReading("unsure")).toBe("rising");
    expect(otherReading("sure")).toBe("unsure");
    expect(endingOf(lesson("tags-1").sentences[0])).toBe("falling");
    expect(endingOf(lesson("tags-2").sentences[0])).toBe("rising");
  });
});

describe("Meaning match", () => {
  it("tags 3 is six Meaning match exercises, one per sentence, then draw and shadow", () => {
    const ex = buildExercises(lesson("tags-3").sentences, "tags-3");
    expect(ex).toHaveLength(10);
    expect(PLAN_BY_LESSON["tags-3"]).toHaveLength(10);
    const meaning = ex.filter((e) => e.type === "meaning");
    expect(meaning).toHaveLength(6);
    expect(new Set(meaning.map((e) => e.sentenceId)).size).toBe(6);
    expect(ex.slice(6).map((e) => e.type)).toEqual(["draw", "draw", "shadow", "shadow"]);
    expect(new Set(ex.map((e) => e.id)).size).toBe(10);
  });

  it("other lessons keep the standard plan and never get a Meaning match", () => {
    for (const id of ["tags-1", "tags-2"]) {
      const ex = buildExercises(lesson(id).sentences, id);
      expect(ex.map((e) => e.type)).toEqual(["hear", "hear", "hear", "peak", "peak", "peak", "draw", "draw", "shadow", "shadow"]);
    }
    for (const e of buildExercises(loadLesson("falling", "falling-1")!.sentences, "falling-1")) expect(e.type).not.toBe("meaning");
  });

  it("every tags-3 sentence has its own bilingual situation; other sentences get a generic one", () => {
    const seen = new Set<string>();
    for (const s of lesson("tags-3").sentences) {
      const sit = situationFor(s);
      expect(sit.en.length, s.id).toBeGreaterThan(15);
      expect(sit.th, s.id).toMatch(THAI);
      expect(seen.has(sit.en), `${s.id} reuses a scene`).toBe(false);
      seen.add(sit.en);
    }
    expect(situationFor({ ...lesson("tags-1").sentences[0], id: "nope" }).en.length).toBeGreaterThan(5);
    expect(situationFor({ ...lesson("tags-1").sentences[0], id: "__proto__" }).en.length).toBeGreaterThan(5);
  });

  it("offers the two answers, bilingual, falling tag first", () => {
    expect(MEANING_CHOICES.map((c) => c.reading)).toEqual(["sure", "unsure"]);
    for (const c of MEANING_CHOICES) {
      expect(c.label.th).toMatch(THAI);
      expect(c.tune.th).toMatch(THAI);
    }
    expect(MEANING_CHOICES[0].label.en).toBe("I'm sure");
    expect(MEANING_CHOICES[1].label.en).toBe("I'm asking");
  });

  it("explains the meaning in English and Thai, right or wrong", () => {
    for (const reading of ["sure", "unsure"] as const) {
      for (const right of [true, false]) {
        const f = meaningFeedback(right, reading);
        expect(f.passed).toBe(right);
        expect(f.title.en).toBe(right ? "Nice!" : "Almost");
        expect(f.detail.th).toMatch(THAI);
        expect(f.detail.en).toContain(reading === "sure" ? "FALLS" : "RISES");
        expect(f.detail.en).toContain(reading === "sure" ? "sure" : "not sure");
      }
    }
    expect(meaningFeedback(false, "sure").detail.en).toMatch(/^Not quite\./);
    expect(meaningFeedback(true, "unsure").detail.en).toMatch(/^Right!/);
  });
});

describe("Hear it on tag questions", () => {
  const hears = (id: string) => buildExercises(lesson(id).sentences, id).filter((e): e is HearExercise => e.type === "hear");

  it("asks sure vs not sure: both questions appear, and the asked-for clip is always at correct", () => {
    for (const id of ["tags-1", "tags-2"]) {
      const h = hears(id);
      expect(h).toHaveLength(3);
      expect(new Set(h.map((e) => e.ask))).toEqual(new Set(["falling", "rising"]));
      for (const e of h) {
        expect(e.clips[e.correct], `${id} ${e.id}`).toBe(e.ask);
        expect(e.clips.filter((c) => c === e.ask)).toHaveLength(1);
      }
    }
  });

  it("the question, hint and feedback talk about sure and real questions, in both languages", () => {
    expect(tagHearQuestion("falling").en).toMatch(/SURE/);
    expect(tagHearQuestion("rising").en).toMatch(/real question/);
    for (const ask of ["falling", "rising"] as const) {
      expect(tagHearQuestion(ask).th).toMatch(THAI);
      expect(tagHearHint(ask).th).toMatch(THAI);
      for (const right of [true, false]) {
        for (const other of ["falling", "rising", "flat", "busy"] as const) {
          const f = tagHearFeedback(right, ask, other);
          expect(f.passed).toBe(right);
          expect(f.detail.th).toMatch(THAI);
          expect(f.detail.en).toContain(ask === "falling" ? "3-1" : "2-3");
        }
      }
    }
  });

  it("the no-microphone fallback of a tag lesson is a Hear it on the same sentence", () => {
    const ex = buildExercises(lesson("tags-1").sentences, "tags-1");
    const shadow = ex.find((e) => e.type === "shadow")!;
    if (shadow.type !== "shadow") throw new Error("expected shadow");
    const s = lesson("tags-1").sentences.find((x) => x.id === shadow.sentenceId)!;
    const swap = listeningFallback(shadow, s);
    expect(swap.sentenceId).toBe(s.id);
    expect(swap.clips[swap.correct]).toBe("falling");
    expect(makeHear(s, 1, "x", "rising").clips).toContain("rising");
  });
});

describe("placeholder voice on tag questions", () => {
  // Level 2 is the median F0 of the take; the analysis is a voice-pipeline check, so only the TAG group's ending is judged.
  const tagEnding = (s: Sentence, variant?: Parameters<typeof placeholderClip>[1]) => {
    const { samples, sampleRate } = placeholderClip(s, variant);
    const r = analyzeVoice(samples, sampleRate, s).result!;
    return { r, ending: r.groups[1].checks.find((c) => c.id === "ending")!.status };
  };

  it("renders the 3-1 tag group: it falls", () => {
    for (const s of lesson("tags-1").sentences) {
      const { r, ending } = tagEnding(s);
      expect(r.groups, s.id).toHaveLength(2);
      expect(ending, s.id).toBe("pass");
      expect(r.groups[1].features.endLevel, s.id).toBeLessThan(r.groups[1].features.maxLevel - 1);
    }
  }, 60_000);

  it("renders the 2-3 tag group: it rises and stays up", () => {
    for (const s of lesson("tags-2").sentences) {
      const { r, ending } = tagEnding(s);
      expect(ending, s.id).not.toBe("fail");
      expect(r.groups[1].features.endLevel, s.id).toBeGreaterThanOrEqual(r.groups[1].features.startLevel);
    }
  }, 60_000);

  it("the other ending changes only the tag: a sure sentence played 'rising' is the not-sure reading, and the reverse", () => {
    const sure = lesson("tags-1").sentences[0];
    const unsure = lesson("tags-2").sentences[0];
    const a = placeholderClip(sure, "rising");
    const b = placeholderClip(unsure); // the textbook tune of the not-sure sentence
    expect(a.samples.length).toBe(b.samples.length);
    expect(a.samples).toEqual(b.samples);
    expect(placeholderClip(unsure, "falling").samples).toEqual(placeholderClip(sure).samples);
    // while "flat" is still the monotone mistake
    expect(placeholderClip(sure, "flat").samples).not.toEqual(placeholderClip(sure).samples);
  });
});

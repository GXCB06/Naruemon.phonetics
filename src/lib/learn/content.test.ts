import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dictionary } from "cmu-pronouncing-dictionary";
import { UNITS } from "../course/units.ts";
import { buildSentence, lessonWords } from "../intonation/buildLesson.ts";
import type { LessonSource } from "../intonation/buildLesson.ts";
import { OVERRIDES } from "../ipa/overrides.ts";
import { buildWordIpa } from "../ipa/words.ts";
import type { WordIpa } from "../ipa/words.ts";
import { contentKeys, lessonProblems, loadLesson, parseLesson } from "./content.ts";
import type { LessonContent } from "./content.ts";

const lessons = UNITS.filter((u) => !u.locked).flatMap((u) => u.lessons.map((l) => ({ unit: u.id, lesson: l.id })));

describe("lesson content", () => {
  it("has content for every lesson of every unlocked unit", () => {
    expect(lessons.length).toBeGreaterThanOrEqual(3);
    for (const { unit, lesson } of lessons) expect(loadLesson(unit, lesson), `${unit}/${lesson}`).toBeDefined();
  });

  it("registers no content that the course map does not know", () => {
    const known = new Set(UNITS.flatMap((u) => u.lessons.map((l) => `${u.id}/${l.id}`)));
    for (const k of contentKeys()) expect(known.has(k), k).toBe(true);
  });

  it("unknown units and lessons return undefined (never throw)", () => {
    expect(loadLesson("nope", "falling-1")).toBeUndefined();
    expect(loadLesson("falling", "nope")).toBeUndefined();
    expect(loadLesson("falling", "__proto__")).toBeUndefined();
    expect(loadLesson("falling", "falling-1")).toBeDefined();
  });

  it("every lesson has 4 to 6 valid sentences with unique ids", () => {
    const ids = new Set<string>();
    for (const { unit, lesson } of lessons) {
      const c = loadLesson(unit, lesson)!;
      expect(c.sentences.length).toBeGreaterThanOrEqual(4);
      expect(c.sentences.length).toBeLessThanOrEqual(6);
      for (const s of c.sentences) {
        expect(ids.has(s.id), `duplicate ${s.id}`).toBe(false);
        ids.add(s.id);
      }
    }
  });

  it("each sentence is one falling thought group with the nucleus in range, matching levels and IPA everywhere", () => {
    for (const { unit, lesson } of lessons) {
      for (const s of loadLesson(unit, lesson)!.sentences) {
        expect(s.groups, s.id).toHaveLength(1);
        const g = s.groups[0];
        expect(g.pattern).toBe("2-3-1");
        const word = g.words[g.nucleus.word];
        expect(word, s.id).toBeDefined();
        const nuc = word.syllables[g.nucleus.syllable];
        expect(nuc, s.id).toBeDefined();
        expect(nuc.stressed).toBe(true);
        const sylls = g.words.flatMap((w) => w.syllables);
        for (const y of sylls) {
          expect(y.ipa.length, `${s.id} ${y.text}`).toBeGreaterThan(0);
          expect(y.levels.length).toBeGreaterThanOrEqual(1);
          expect(y.levels.length).toBeLessThanOrEqual(2);
        }
        // nucleus at level 3, nothing after it above 1, nothing before it above 2
        const flatNuc = g.words.slice(0, g.nucleus.word).reduce((n, w) => n + w.syllables.length, 0) + g.nucleus.syllable;
        expect(nuc.levels[0]).toBe(3);
        sylls.forEach((y, i) => {
          if (i < flatNuc) expect(y.levels).toEqual([2]);
          if (i > flatNuc) expect(y.levels).toEqual([1]);
        });
        // the nucleus is the last content word: only short pronouns may follow it
        expect(g.words.length - 1 - g.nucleus.word).toBeLessThanOrEqual(2);
        // the spelling chunks spell the words
        for (const w of g.words) {
          expect(w.syllables.map((y) => y.text).join("").toLowerCase()).toBe(w.text.replace(/[^A-Za-z']/g, "").toLowerCase());
        }
        expect(s.note.en.length).toBeGreaterThan(0);
        expect(s.note.th.length).toBeGreaterThan(0);
      }
    }
  });

  it("content/units is exactly what tools/build-lessons.ts builds from content/source (nothing hand-edited)", () => {
    const root = new URL("../../../content/", import.meta.url);
    for (const { unit, lesson } of lessons) {
      const src = JSON.parse(readFileSync(new URL(`source/${unit}/${lesson}.json`, root), "utf8")) as LessonSource;
      const table: Record<string, WordIpa> = {};
      for (const w of lessonWords(src)) table[w] = buildWordIpa(w, dictionary, OVERRIDES);
      const built = src.sentences.map((s) => buildSentence(s, table));
      expect(loadLesson(unit, lesson)!.sentences).toEqual(built);
    }
    // no generated file without a source
    for (const u of readdirSync(new URL("units/", root))) {
      for (const f of readdirSync(new URL(`units/${u}/`, root))) {
        expect(() => readFileSync(new URL(`source/${u}/${f}`, root)), `${u}/${f}`).not.toThrow();
      }
    }
  });
});

describe("lessonProblems", () => {
  const good = (): LessonContent => structuredClone(loadLesson("falling", "falling-2")!);

  it("accepts the real lessons", () => {
    expect(lessonProblems(good())).toEqual([]);
    expect(() => parseLesson(good())).not.toThrow();
  });

  it("catches a nucleus outside the group", () => {
    const c = good();
    c.sentences[0].groups[0].nucleus = { word: 99, syllable: 0 };
    expect(lessonProblems(c).join()).toMatch(/nucleus is outside/);
    expect(() => parseLesson(c)).toThrow(/Invalid lesson/);
  });

  it("catches missing IPA and bad levels", () => {
    const c = good();
    c.sentences[0].groups[0].words[0].syllables[0].ipa = "";
    c.sentences[1].groups[0].words[0].syllables[0].levels = [7];
    const p = lessonProblems(c).join("\n");
    expect(p).toMatch(/ipa missing/);
    expect(p).toMatch(/levels must be/);
  });

  it("catches levels that do not follow 2-3-1 around the nucleus", () => {
    const c = good();
    c.sentences[0].groups[0].words[0].syllables[0].levels = [3];
    expect(lessonProblems(c).join()).toMatch(/2-3-1/);
  });

  it("catches duplicate ids, empty lessons and junk", () => {
    const c = good();
    c.sentences[1].id = c.sentences[0].id;
    expect(lessonProblems(c).join()).toMatch(/duplicate/);
    expect(lessonProblems({ id: "a", unit: "b", sentences: [] }).join()).toMatch(/non-empty/);
    expect(lessonProblems(null)).toEqual(["lesson is not an object"]);
    expect(lessonProblems("x")).toEqual(["lesson is not an object"]);
  });
});

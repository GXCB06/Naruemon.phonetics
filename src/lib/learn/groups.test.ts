import { describe, expect, it } from "vitest";
import { analyzeVoice } from "../audio/analyzeVoice.ts";
import { levelsForGroup, levelsForNonFinalGroup, levelsForRisingGroup, noteFor, patternsFor } from "../intonation/buildLesson.ts";
import { layoutSentence, targetContour } from "../intonation/contour.ts";
import { analyze } from "../intonation/engine.ts";
import type { PatternId, Sentence } from "../intonation/types.ts";
import { lessonProblems, loadLesson } from "./content.ts";
import {
  askedClip,
  buildExercises,
  defaultAsk,
  distractorFor,
  endingOf,
  hasOpenGroup,
  isListSentence,
  listeningFallback,
  makeHear,
} from "./exercises.ts";
import type { ClipVariant, HearExercise } from "./exercises.ts";
import { analysisFeedback, hearFeedback, peakFeedback, peakLabels } from "./feedback.ts";
import { allFalling, placeholderClip } from "./reference.ts";

const LESSONS = [
  ["lists", "lists-1"],
  ["lists", "lists-2"],
  ["nonfinal", "nonfinal-1"],
  ["nonfinal", "nonfinal-2"],
] as const;
const lesson = (id: string) => loadLesson(id.split("-")[0], id)!;
const all = LESSONS.flatMap(([, id]) => lesson(id).sentences);
const byId = (id: string): Sentence => all.find((s) => s.id === id)!;
const THAI = /[฀-๿]/;
const patternsOf = (s: Sentence): PatternId[] => s.groups.map((g) => g.pattern);
const nucleusIndex = (g: Sentence["groups"][number]) => g.words.slice(0, g.nucleus.word).reduce((n, w) => n + w.syllables.length, 0) + g.nucleus.syllable;

describe("levelsForNonFinalGroup", () => {
  it("starts at 2, puts 3 on the nucleus and comes back to 2 (never 1)", () => {
    expect(levelsForNonFinalGroup(3, 2)).toEqual([[2], [2], [3, 2]]); // "If it rains,"
    expect(levelsForNonFinalGroup(3, 1)).toEqual([[2], [3], [2]]); // "how-EV-er"
    expect(levelsForNonFinalGroup(4, 1)).toEqual([[2], [3], [2], [2]]);
    expect(levelsForNonFinalGroup(3, 0)).toEqual([[2, 3], [2], [2]]); // a first-syllable nucleus still starts at 2
    expect(levelsForNonFinalGroup(1, 0)).toEqual([[3, 2]]);
    for (const n of [1, 2, 5]) for (let i = 0; i < n; i++) for (const l of levelsForNonFinalGroup(n, i).flat()) expect(l).toBeGreaterThanOrEqual(2);
  });

  it("rejects a nucleus outside the group", () => {
    expect(() => levelsForNonFinalGroup(3, 3)).toThrow();
    expect(() => levelsForNonFinalGroup(0, 0)).toThrow();
  });
});

describe("patternsFor", () => {
  it("authored patterns win; the defaults: lists and non-final sentences fall only on the last group", () => {
    expect(patternsFor("list", 3)).toEqual(["2-3", "2-3", "2-3-1"]);
    expect(patternsFor("nonfinal", 2)).toEqual(["2-3-2", "2-3-1"]);
    expect(patternsFor("nonfinal", 3)).toEqual(["2-3-2", "2-3-2", "2-3-1"]);
    expect(patternsFor("choice", 2)).toEqual(["2-3", "2-3"]);
    expect(patternsFor("statement", 1)).toEqual(["2-3-1"]);
    expect(patternsFor("list", 3, ["2-3", "2-3", "2-3"])).toEqual(["2-3", "2-3", "2-3"]);
  });

  it("the list note says whether the last item falls", () => {
    expect(noteFor("list", ["A", "B", "C"], ["2-3", "2-3", "2-3-1"]).en).toMatch(/last item comes down/);
    expect(noteFor("list", ["A", "B", "C"], ["2-3", "2-3", "2-3"]).en).not.toMatch(/comes down/);
    for (const kind of ["list", "choice", "nonfinal"] as const) {
      const n = noteFor(kind, ["A", "B"], ["2-3", "2-3-1"]);
      expect(n.en.length).toBeGreaterThan(20);
      expect(n.th).toMatch(THAI);
    }
  });
});

describe("lists and nonfinal content", () => {
  it("has the four lessons with 3, 4, 4 and 4 sentences, all valid", () => {
    expect(lesson("lists-1").sentences).toHaveLength(3);
    expect(lesson("lists-2").sentences).toHaveLength(4);
    expect(lesson("nonfinal-1").sentences).toHaveLength(4);
    expect(lesson("nonfinal-2").sentences).toHaveLength(4);
    for (const [unit, id] of LESSONS) {
      expect(lessonProblems(JSON.parse(JSON.stringify(loadLesson(unit, id))))).toEqual([]);
    }
  });

  it("statement lists: every item rises (2-3), the last item falls (2-3-1) — the assumption to confirm with the teacher", () => {
    expect(patternsOf(byId("lists-1-pasta"))).toEqual(["2-3", "2-3", "2-3", "2-3-1"]);
    expect(patternsOf(byId("lists-1-need"))).toEqual(["2-3", "2-3", "2-3", "2-3-1"]);
    expect(patternsOf(byId("lists-1-store"))).toEqual(["2-3", "2-3", "2-3-1"]);
  });

  it("choices: every item rises (2-3), the last one too", () => {
    for (const s of lesson("lists-2").sentences) {
      expect(s.groups.length, s.id).toBeGreaterThanOrEqual(2);
      for (const g of s.groups) expect(g.pattern, s.id).toBe("2-3");
    }
    expect(byId("lists-2-inout").text).toBe("Did you say in or out?");
  });

  it("non-final sentences: every group but the last is 2-3-2, the last is 2-3-1", () => {
    for (const s of [...lesson("nonfinal-1").sentences, ...lesson("nonfinal-2").sentences]) {
      const p = patternsOf(s);
      expect(p.at(-1), s.id).toBe("2-3-1");
      for (const x of p.slice(0, -1)) expect(x, s.id).toBe("2-3-2");
    }
    expect(byId("nonfinal-2-amad").groups).toHaveLength(3); // ... Japan; | however, | he has a meeting.
  });

  it("the nucleus of each group is the stressed syllable of its last content word", () => {
    const peaks = (id: string) => peakLabels(byId(id));
    expect(peaks("nonfinal-1-fact")).toEqual(["FACT", "LIVES"]);
    expect(peaks("nonfinal-1-opinion")).toEqual(["-PIN-", "-PEN-"]);
    expect(peaks("nonfinal-1-rains")).toEqual(["RAINS", "BUS"]);
    expect(peaks("nonfinal-1-picnic")).toEqual(["NICE", "PIC-"]);
    expect(peaks("nonfinal-2-bobby")).toEqual(["FISH", "SAT-"]);
    expect(peaks("nonfinal-2-amad")).toEqual(["-PAN", "-EV-", "MEET-"]);
    expect(peaks("nonfinal-2-movies")).toEqual(["MOV-", "MALL"]);
    expect(peaks("nonfinal-2-smart")).toEqual(["SMART", "SCHOOL"]);
    expect(peaks("lists-1-pasta")).toEqual(["PAS-", "PIZ-", "SAL-", "HAM-"]);
    expect(peaks("lists-1-need")).toEqual(["PAS-", "HAM", "-MA-", "BA-"]);
    expect(peaks("lists-1-store")).toEqual(["-NA-", "-CA-", "STORE"]);
    expect(peaks("lists-2-coffee")).toEqual(["COF-", "CHOCO-", "MILK"]);
    expect(peaks("lists-2-red")).toEqual(["RED", "BLUE"]);
    expect(peaks("lists-2-read")).toEqual(["EAT", "NEWS-"]);
    expect(peaks("lists-2-inout")).toEqual(["IN", "OUT"]);
  });

  it("every non-final group starts at 2, peaks at 3 on a stressed nucleus and ends at 2", () => {
    for (const s of all) {
      for (const g of s.groups.filter((x) => x.pattern === "2-3-2")) {
        const sylls = g.words.flatMap((w) => w.syllables);
        const n = nucleusIndex(g);
        expect(sylls[0].levels[0], s.id).toBe(2);
        expect(Math.max(...sylls[n].levels), s.id).toBe(3);
        expect(sylls[n].stressed, s.id).toBe(true);
        expect(sylls.at(-1)!.levels.at(-1), s.id).toBe(2);
        for (const y of sylls) expect(Math.min(...y.levels), s.id).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("matches the generator functions for the pattern of every group", () => {
    for (const s of all) {
      for (const g of s.groups) {
        const sylls = g.words.flatMap((w) => w.syllables);
        const f = g.pattern === "2-3" ? levelsForRisingGroup : g.pattern === "2-3-2" ? levelsForNonFinalGroup : levelsForGroup;
        expect(sylls.map((y) => y.levels), s.id).toEqual(f(sylls.length, nucleusIndex(g)));
      }
    }
  });

  it("the generated target of every sentence passes the rule engine with no failed check, and scores high", () => {
    for (const s of all) {
      const target = targetContour(layoutSentence(s));
      const r = analyze(s, target, { modality: "draw", timingKnown: true });
      for (const g of r.groups) {
        for (const c of g.checks) expect(c.status, `${s.id} group ${g.groupIndex} ${c.id}`).not.toBe("fail");
      }
      expect(r.overall, s.id).toBeGreaterThanOrEqual(85);
      expect(analysisFeedback(r).passed, s.id).toBe(true);
    }
  });

  it("a non-final part that drops to 1 fails its ending (it sounds finished); a monotone drawing is not Nice", () => {
    const s = byId("nonfinal-1-rains");
    const layout = layoutSentence(s);
    const target = targetContour(layout);
    const span = layout.groupSpans[0];
    const dropped = target.map((p) => (p.v !== null && p.t > span.start + (span.end - span.start) * 0.7 && p.t <= span.end ? { t: p.t, v: 1 } : p));
    const r = analyze(s, dropped, { modality: "draw", timingKnown: true });
    expect(r.groups[0].checks.find((c) => c.id === "ending")!.status).toBe("fail");
    expect(analysisFeedback(r).passed).toBe(false);
    const flat = analyze(s, target.map((p) => ({ t: p.t, v: p.v === null ? null : 2 })), { modality: "draw", timingKnown: true });
    expect(analysisFeedback(flat).passed).toBe(false);
  });

  it("a list item that falls fails its ending", () => {
    const s = byId("lists-2-red");
    const layout = layoutSentence(s);
    const target = targetContour(layout);
    const span = layout.groupSpans[0];
    const falling = target.map((p) => (p.v !== null && p.t > span.start + (span.end - span.start) * 0.7 && p.t <= span.end ? { t: p.t, v: 1 } : p));
    const r = analyze(s, falling, { modality: "draw", timingKnown: true });
    expect(r.groups[0].checks.find((c) => c.id === "ending")!.status).toBe("fail");
  });
});

describe("hear it in the lists and non-final units", () => {
  const hears = (id: string) => buildExercises(lesson(id).sentences, id).filter((e): e is HearExercise => e.type === "hear");

  it("classifies the sentences", () => {
    for (const s of lesson("nonfinal-1").sentences) {
      expect(hasOpenGroup(s)).toBe(true);
      expect(isListSentence(s)).toBe(false);
      expect(defaultAsk(s)).toBe("unfinished");
      expect(endingOf(s)).toBe("falling");
    }
    for (const s of [...lesson("lists-1").sentences, ...lesson("lists-2").sentences]) {
      expect(hasOpenGroup(s)).toBe(false);
      expect(isListSentence(s)).toBe(true);
      expect(defaultAsk(s)).toBe("lifting");
    }
    expect(endingOf(byId("lists-1-pasta"))).toBe("falling");
    expect(endingOf(byId("lists-2-red"))).toBe("rising");
  });

  it("non-final lessons alternate 'which sounds unfinished?' and 'which sounds finished?'", () => {
    for (const id of ["nonfinal-1", "nonfinal-2"]) {
      const h = hears(id);
      expect(h.map((e) => e.ask)).toEqual(["unfinished", "finished", "unfinished"]);
      for (const e of h) {
        const s = byId(e.sentenceId);
        expect(e.clips[e.correct]).toBe(askedClip(e.ask, s));
        expect(e.clips.filter((c) => c === e.clips[e.correct])).toHaveLength(1);
        const other = e.clips[e.correct === 0 ? 1 : 0];
        if (e.ask === "finished") {
          expect(e.clips[e.correct]).toBe("finished");
          expect(other).toBe("falling"); // the textbook clip: the first part comes back to mid
        } else {
          expect(e.clips[e.correct]).toBe("falling");
          expect(["finished", "flat"]).toContain(other);
        }
      }
      expect(new Set(h.map((e) => e.correct)).size).toBe(2);
    }
  });

  it("lists lessons always ask for the clip that rises on every item; the wrong clip drops on every item or is flat", () => {
    for (const id of ["lists-1", "lists-2"]) {
      const h = hears(id);
      expect(h).toHaveLength(3);
      for (const e of h) {
        const s = byId(e.sentenceId);
        expect(e.ask).toBe("lifting");
        expect(e.clips[e.correct]).toBe(endingOf(s)); // the textbook clip of the sentence
        expect(["finished", "flat"]).toContain(e.clips[e.correct === 0 ? 1 : 0]);
      }
      expect(new Set(h.map((e) => e.correct)).size).toBe(2);
    }
    const seen = new Set(Array.from({ length: 6 }, (_, k) => distractorFor(byId("lists-1-need"), k)));
    expect(seen).toEqual(new Set(["finished", "flat"]));
  });

  it("the no-microphone fallback asks the unit's own question", () => {
    for (const id of ["nonfinal-1", "lists-1", "lists-2"]) {
      const shadow = buildExercises(lesson(id).sentences, id).find((e) => e.type === "shadow")!;
      if (shadow.type !== "shadow") throw new Error("expected shadow");
      const s = byId(shadow.sentenceId);
      const swap = listeningFallback(shadow, s);
      expect(swap.ask).toBe(defaultAsk(s));
      expect(swap.clips[swap.correct]).toBe(askedClip(swap.ask, s));
    }
  });

  it("earlier units keep their behaviour: falling lessons still ask falling, rising-1 rising", () => {
    for (const e of buildExercises(loadLesson("falling", "falling-1")!.sentences, "falling-1")) if (e.type === "hear") expect(e.ask).toBe("falling");
    for (const e of buildExercises(loadLesson("rising", "rising-1")!.sentences, "rising-1")) if (e.type === "hear") expect(e.ask).toBe("rising");
    const rising2 = buildExercises(loadLesson("rising", "rising-2")!.sentences, "rising-2").filter((e): e is HearExercise => e.type === "hear");
    expect(new Set(rising2.map((e) => e.ask))).toEqual(new Set(["rising", "falling"]));
  });

  it("feedback is bilingual in every combination and says what the clips did", () => {
    const wrongClips: ClipVariant[] = ["finished", "flat"];
    for (const right of [true, false]) {
      for (const other of wrongClips) {
        for (const textbook of ["falling", "rising"] as const) {
          const f = hearFeedback(right, other, "lifting", textbook);
          expect(f.passed).toBe(right);
          expect(f.title.en).toBe(right ? "Nice!" : "Almost");
          expect(f.detail.en.length).toBeGreaterThan(10);
          expect(f.detail.th).toMatch(THAI);
        }
        const u = hearFeedback(right, other, "unfinished", "falling");
        expect(u.detail.th).toMatch(THAI);
        expect(u.detail.en).toMatch(right ? /MID/ : /unfinished|MID/);
      }
      const fin = hearFeedback(right, "falling", "finished", "falling");
      expect(fin.passed).toBe(right);
      expect(fin.detail.th).toMatch(THAI);
      expect(fin.detail.en).toMatch(/LOW/);
    }
    expect(hearFeedback(true, "finished", "lifting", "falling").detail.en).toMatch(/last item comes down/);
    expect(hearFeedback(true, "finished", "lifting", "rising").detail.en).toMatch(/the last one too/);
    // old calls unchanged
    expect(hearFeedback(true, "rising").detail.en).toMatch(/falling sentence ends LOW/);
    expect(hearFeedback(true, "falling", "rising", "rising").detail.en).toMatch(/HIGH/);
  });

  it("find-the-peak feedback names one syllable per thought group", () => {
    const f = peakFeedback(true, byId("nonfinal-2-amad"));
    expect(f.detail.en).toContain("-PAN, -EV- and MEET-");
    expect(f.detail.th).toMatch(THAI);
    expect(peakFeedback(false, byId("lists-1-need")).detail.en).toContain("PAS-, HAM, -MA- and BA-");
  });
});

describe("placeholder voice for the lists and non-final units", () => {
  it("'finished' makes every group fall (2-3-1) on its own nucleus and leaves the text alone", () => {
    for (const s of all) {
      const f = allFalling(s);
      expect(f.text).toBe(s.text);
      expect(f.groups.map((g) => g.pattern)).toEqual(s.groups.map(() => "2-3-1"));
      for (const [gi, g] of f.groups.entries()) {
        expect(g.nucleus).toEqual(s.groups[gi].nucleus);
        const sylls = g.words.flatMap((w) => w.syllables);
        expect(sylls.map((y) => y.levels), s.id).toEqual(levelsForGroup(sylls.length, nucleusIndex(g)));
      }
    }
    // a sentence that already falls everywhere is unchanged
    const falling = loadLesson("falling", "falling-1")!.sentences[0];
    expect(allFalling(falling).groups).toEqual(falling.groups);
  });

  it("every clip variant is audible (one sentence per lesson)", () => {
    for (const s of LESSONS.map(([, id]) => lesson(id).sentences[0])) {
      for (const v of ["falling", "finished", "flat"] as const) {
        const { samples } = placeholderClip(s, v);
        expect(samples.length, `${s.id} ${v}`).toBeGreaterThan(48000);
      }
    }
  }, 60_000);

  it("the unfinished clip comes back to mid and the finished clip drops to low, as our own pipeline hears it", () => {
    const s = byId("nonfinal-1-rains");
    const first = (variant: ClipVariant) => {
      const { samples, sampleRate } = placeholderClip(s, variant);
      const r = analyzeVoice(samples, sampleRate, s).result!;
      return r.groups[0];
    };
    const textbook = first("falling");
    const finished = first("finished");
    expect(textbook.checks.find((c) => c.id === "ending")!.status).not.toBe("fail");
    expect(finished.checks.find((c) => c.id === "ending")!.status).toBe("fail");
    expect(finished.features.endLevel).toBeLessThan(textbook.features.endLevel);
  }, 60_000);

  it("a list clip that drops on every item fails the ending of the first item", () => {
    const s = byId("lists-2-red");
    const { samples, sampleRate } = placeholderClip(s, "finished");
    const r = analyzeVoice(samples, sampleRate, s).result!;
    expect(r.groups[0].checks.find((c) => c.id === "ending")!.status).toBe("fail");
    const good = placeholderClip(s);
    const g = analyzeVoice(good.samples, good.sampleRate, s).result!;
    expect(g.groups[0].checks.find((c) => c.id === "ending")!.status).not.toBe("fail");
  }, 60_000);
});

describe("one hear exercise built by hand", () => {
  it("asking 'finished' pairs the mistake with the textbook clip; asking 'unfinished' pairs the textbook with a mistake", () => {
    const s = byId("nonfinal-1-picnic");
    const a = makeHear(s, 0, "x", "finished");
    expect(a.clips[a.correct]).toBe("finished");
    expect(a.clips[a.correct === 0 ? 1 : 0]).toBe("falling");
    const b = makeHear(s, 1, "y");
    expect(b.ask).toBe("unfinished");
    expect(b.clips[b.correct]).toBe("falling");
  });
});

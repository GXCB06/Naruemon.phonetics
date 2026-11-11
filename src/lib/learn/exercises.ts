// Exercise generation for the lesson player. Pure and deterministic: the same sentences always give the same lesson,
// so server and client render the same first screen and tests can pin the order.

import { LIST_KIND_LABELS } from "../intonation/buildLesson.ts";
import type { Sentence } from "../intonation/types.ts";
import variantManifest from "../../../public/audio/variants/manifest.json" with { type: "json" };
import { hasRealVariants, parseVariantManifest } from "../synth/variantManifest.ts";
import { hashSeed, seededShuffle, tuneBank } from "./build.ts";
import { isTagSentence } from "./meaning.ts";

/**
 * How a practice clip sounds. The first two name how the clip ENDS:
 *  - falling: ends low (the textbook tune of a statement, command or wh-question; the typical mistake on a yes/no question)
 *  - rising: ends up (the textbook tune of a yes/no question, a name or an interjection; the typical mistake on a wh-question)
 *  - flat: monotone, no clear peak
 *  - busy: a little rise on every stressed word ("a tone on every word")
 * Which of "falling" and "rising" is the textbook one depends on the sentence: see `endingOf`.
 *  - finished: every thought group drops to low (2-3-1), so the parts that should stay open (non-final 2-3-2 parts, list
 *    items) sound finished: the typical mistake in the lists and non-final units
 */
export type ClipVariant = "falling" | "rising" | "flat" | "busy" | "finished";

/** How a sentence ends when it is said the textbook way. */
export type Ending = "falling" | "rising";

/** The textbook ending of a sentence: rising when its last thought group is a 2-3 group, falling otherwise. */
export function endingOf(sentence: Sentence): Ending {
  return sentence.groups[sentence.groups.length - 1].pattern === "2-3" ? "rising" : "falling";
}

/**
 * What a "Hear it" exercise asks for: the textbook ending (`Ending`), or, for sentences with several kinds of thought group:
 *  - unfinished: the clip where the non-final parts come back to mid (2-3-2), so more is coming
 *  - finished: the clip where the non-final parts drop to low, so they sound finished (the mistake)
 *  - lifting: the clip that rises on every item of a list or choice
 */
export type HearAsk = Ending | "unfinished" | "finished" | "lifting";

/** A sentence whose earlier thought groups are non-final (2-3-2): "If it rains, I will take the bus." */
export function hasOpenGroup(sentence: Sentence): boolean {
  return sentence.groups.slice(0, -1).some((g) => g.pattern === "2-3-2");
}

/** A list or a question with choices: one item per thought group. */
export function isListSentence(sentence: Sentence): boolean {
  return LIST_KIND_LABELS.includes(sentence.kind);
}

/** What a "Hear it" exercise on this sentence asks when nothing says otherwise. */
export function defaultAsk(sentence: Sentence): HearAsk {
  if (hasOpenGroup(sentence)) return "unfinished";
  if (isListSentence(sentence)) return "lifting";
  return endingOf(sentence);
}

/** The clip variant that has the tune `ask` is asking for. */
export function askedClip(ask: HearAsk, sentence: Sentence): ClipVariant {
  if (ask === "finished") return "finished";
  return ask === "unfinished" || ask === "lifting" ? endingOf(sentence) : ask;
}

export interface HearExercise {
  type: "hear";
  id: string;
  sentenceId: string;
  /** Which tune the learner is asked to find: "Which one is the falling / rising tune?". */
  ask: HearAsk;
  /** The two clips, in the order shown (A, B). */
  clips: [ClipVariant, ClipVariant];
  /** Index (0 = A, 1 = B) of the clip that has the asked-for tune (`clips[correct] === askedClip(ask, sentence)`). */
  correct: 0 | 1;
}
export interface PeakExercise {
  type: "peak";
  id: string;
  sentenceId: string;
}
export interface DrawExercise {
  type: "draw";
  id: string;
  sentenceId: string;
}
export interface ShadowExercise {
  type: "shadow";
  id: string;
  sentenceId: string;
}
/** Meaning match (tag questions): hear one clip and say what the speaker means. The meaning comes from the sentence's own tag group. */
export interface MeaningExercise {
  type: "meaning";
  id: string;
  sentenceId: string;
}
/**
 * Match the pairs: three clips of the same sentence (ends low / ends high / flat) on the left, three descriptions on the
 * right. Tap a clip to hear it, then tap what it does.
 */
export interface MatchExercise {
  type: "match";
  id: string;
  sentenceId: string;
  /** Clip order on the left. */
  clips: [ClipVariant, ClipVariant, ClipVariant];
  /** Description order on the right (a different order from `clips`). */
  labels: [ClipVariant, ClipVariant, ClipVariant];
}
/** Build the tune: tap level tiles (and "|" between thought groups) into a line, e.g. 2 3 2 | 2 3 1. */
export interface BuildExercise {
  type: "build";
  id: string;
  sentenceId: string;
  /** The shuffled tile bank, answer tiles plus distractors (see `tuneBank`). */
  bank: string[];
}
export type Exercise = HearExercise | PeakExercise | DrawExercise | ShadowExercise | MeaningExercise | MatchExercise | BuildExercise;
export type ExerciseType = Exercise["type"];

/** Listening first (with a pairs board), then reading the tune (with a tile line), then producing it. 12 exercises. */
export const PLAN: readonly ExerciseType[] = ["hear", "match", "hear", "peak", "build", "hear", "peak", "peak", "draw", "draw", "shadow", "shadow"];

/** The three clips of "Match the pairs": always distinct, whatever the sentence. */
export const MATCH_VARIANTS: readonly ClipVariant[] = ["falling", "rising", "flat"];

export function makeMatch(sentence: Sentence, id: string): MatchExercise {
  const seed = hashSeed(id);
  const clips = seededShuffle(MATCH_VARIANTS, seed) as MatchExercise["clips"];
  let labels = seededShuffle(MATCH_VARIANTS, seed + 1) as MatchExercise["labels"];
  // never line the answers up straight across
  if (labels.some((l, i) => l === clips[i])) labels = [clips[1], clips[2], clips[0]];
  return { type: "match", id, sentenceId: sentence.id, clips, labels };
}

export function makeBuild(sentence: Sentence, id: string): BuildExercise {
  return { type: "build", id, sentenceId: sentence.id, bank: tuneBank(sentence, hashSeed(id)) };
}

/**
 * Lessons whose "Hear it" exercises alternate between asking for the rising and the falling clip. Every other lesson asks
 * for the sentence's own textbook ending. (Listed here, not in the lesson file, because the lesson player builds its
 * exercises from `buildExercises(sentences, lessonId)` alone.)
 */
export const MIXED_HEAR_LESSONS: readonly string[] = ["rising-2"];

/** Lessons with their own exercise order instead of `PLAN`. Tags 3 is a "which do you mean?" lesson: one Meaning match per sentence. */
export const PLAN_BY_LESSON: Readonly<Record<string, readonly ExerciseType[]>> = {
  "tags-3": ["meaning", "meaning", "meaning", "meaning", "meaning", "meaning", "draw", "draw", "shadow", "shadow"],
};

/**
 * True when "a tone on every word" would sound different from the textbook tune for this sentence: some stressed
 * syllable other than the nucleus (and not the very last syllable) exists, e.g. the "a" of "situation".
 */
export function hasBusyVariant(sentence: Sentence): boolean {
  return sentence.groups.some((g) => {
    const sylls = g.words.flatMap((w) => w.syllables);
    let nucleus = g.words.slice(0, g.nucleus.word).reduce((n, w) => n + w.syllables.length, 0) + g.nucleus.syllable;
    nucleus = Math.max(0, nucleus);
    return sylls.some((s, i) => s.stressed && i !== sylls.length - 1 && i !== nucleus);
  });
}

/**
 * The wrong clip for the k-th "hear" exercise: rotates through the typical mistakes, skipping ones that would sound the same.
 * Falling sentences: ends up / flat / a bump on every word. Rising sentences: ends down / flat ("busy" would still end up,
 * which would make "which one rises?" ambiguous).
 */
export function distractorFor(sentence: Sentence, k: number): ClipVariant {
  const rising = endingOf(sentence) === "rising";
  // Lists and non-final sentences: the typical mistake is to drop on every group ("finished"); "busy" would still rise on items.
  const groups = hasOpenGroup(sentence) || isListSentence(sentence);
  const pool: readonly ClipVariant[] = groups ? ["finished", "flat"] : rising ? ["falling", "flat"] : ["rising", "flat", "busy"];
  for (let i = 0; i < pool.length; i++) {
    const d = pool[(k + i) % pool.length];
    if (d !== "busy" || hasBusyVariant(sentence)) return d;
  }
  return rising ? "falling" : "rising";
}

/** Real-voice clips that exist (made by tools/make-variants.ts). Exercises prefer clips that all have a real voice. */
const REAL_CLIPS = parseVariantManifest(variantManifest);

/** The mistakes that make sense for a sentence, starting from the k-th (the order `distractorFor` walks). */
function distractorOrder(sentence: Sentence, k: number): ClipVariant[] {
  const rising = endingOf(sentence) === "rising";
  const groups = hasOpenGroup(sentence) || isListSentence(sentence);
  const pool: readonly ClipVariant[] = groups ? ["finished", "flat"] : rising ? ["falling", "flat"] : ["rising", "flat", "busy"];
  return pool.map((_, i) => pool[(k + i) % pool.length]).filter((d) => d !== "busy" || hasBusyVariant(sentence));
}

/**
 * A "hear it" exercise; `k` decides which mistake is the distractor and whether the right clip is A or B.
 * `ask` is the tune the learner must find (default: `defaultAsk`). Asking for the OTHER ending ("which one falls?" on a
 * yes/no question) or for the "finished" clip pairs the mistake with the textbook clip.
 */
export function makeHear(sentence: Sentence, k: number, id: string, ask?: HearAsk): HearExercise {
  const textbook = endingOf(sentence);
  const wanted = ask ?? defaultAsk(sentence);
  const target = askedClip(wanted, sentence);
  let other: ClipVariant = target === textbook ? distractorFor(sentence, k) : textbook;
  // both clips a real voice when possible: among the sensible mistakes, take the first that has a real clip next to the target
  if (target === textbook && !hasRealVariants(REAL_CLIPS, sentence.id, [target, other])) {
    other = distractorOrder(sentence, k).find((d) => hasRealVariants(REAL_CLIPS, sentence.id, [target, d])) ?? other;
  }
  const correct: 0 | 1 = k % 2 === 0 ? 1 : 0; // B, A, B ...: the answer is not always in the same place
  return {
    type: "hear",
    id,
    sentenceId: sentence.id,
    ask: wanted,
    clips: correct === 1 ? [other, target] : [target, other],
    correct,
  };
}

/**
 * The lesson's exercises, built from its sentences. Sentences are used in rotation so every sentence appears and the
 * same one rarely repeats back to back. Needs at least one sentence.
 */
export function buildExercises(sentences: readonly Sentence[], lessonId: string): Exercise[] {
  if (sentences.length === 0) throw new Error(`Lesson ${lessonId} has no sentences`);
  const mixed = MIXED_HEAR_LESSONS.includes(lessonId);
  const plan = Object.hasOwn(PLAN_BY_LESSON, lessonId) ? PLAN_BY_LESSON[lessonId] : PLAN;
  let cursor = 0;
  let hearCount = 0;
  return plan.map((type, i) => {
    const sentence = sentences[cursor++ % sentences.length];
    const id = `${lessonId}-${i + 1}-${type}`;
    if (type === "hear") {
      const k = hearCount++;
      const textbook = endingOf(sentence);
      const base = defaultAsk(sentence);
      // non-final sentences alternate "which sounds unfinished?" / "which sounds finished?"; rising-2 alternates rising / falling
      const ask: HearAsk =
        base === "unfinished" ? (k % 2 === 1 ? "finished" : base) : (mixed || isTagSentence(sentence)) && k % 2 === 1 ? (textbook === "rising" ? "falling" : "rising") : base;
      return makeHear(sentence, k, id, ask);
    }
    if (type === "match") {
      // the sentence of this lesson whose three clips all exist as a real voice, when there is one
      const real = sentences.filter((s) => hasRealVariants(REAL_CLIPS, s.id, MATCH_VARIANTS));
      return makeMatch(real.length ? real[(i + lessonId.length) % real.length] : sentence, id);
    }
    if (type === "build") return makeBuild(sentence, id);
    return { type, id, sentenceId: sentence.id };
  });
}

/** When there is no microphone, a "shadow it" exercise becomes a listening exercise on the same sentence. */
export function listeningFallback(exercise: ShadowExercise, sentence: Sentence): HearExercise {
  return makeHear(sentence, 0, `${exercise.id}-listen`);
}

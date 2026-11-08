// Exercise generation for the lesson player. Pure and deterministic: the same sentences always give the same lesson,
// so server and client render the same first screen and tests can pin the order.

import type { Sentence } from "../intonation/types.ts";

/**
 * How a practice clip sounds:
 *  - falling: the textbook tune (the right answer)
 *  - rising: ends UP instead of down (typical mistake with wh-questions)
 *  - flat: monotone, no clear peak
 *  - busy: a little rise on every stressed word ("a tone on every word")
 */
export type ClipVariant = "falling" | "rising" | "flat" | "busy";

export interface HearExercise {
  type: "hear";
  id: string;
  sentenceId: string;
  /** The two clips, in the order shown (A, B). */
  clips: [ClipVariant, ClipVariant];
  /** Index (0 = A, 1 = B) of the falling clip. */
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
export type Exercise = HearExercise | PeakExercise | DrawExercise | ShadowExercise;
export type ExerciseType = Exercise["type"];

/** Listening first, then reading the tune, then producing it. 10 exercises. */
export const PLAN: readonly ExerciseType[] = ["hear", "hear", "hear", "peak", "peak", "peak", "draw", "draw", "shadow", "shadow"];

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

const DISTRACTORS: readonly Exclude<ClipVariant, "falling">[] = ["rising", "flat", "busy"];

/** The wrong clip for the k-th "hear" exercise: rotates through the typical mistakes, skipping ones that would sound the same. */
export function distractorFor(sentence: Sentence, k: number): Exclude<ClipVariant, "falling"> {
  for (let i = 0; i < DISTRACTORS.length; i++) {
    const d = DISTRACTORS[(k + i) % DISTRACTORS.length];
    if (d !== "busy" || hasBusyVariant(sentence)) return d;
  }
  return "rising";
}

/** A "hear it" exercise; `k` decides which mistake is the distractor and whether the right clip is A or B. */
export function makeHear(sentence: Sentence, k: number, id: string): HearExercise {
  const wrong = distractorFor(sentence, k);
  const correct: 0 | 1 = k % 2 === 0 ? 1 : 0; // B, A, B ...: the answer is not always in the same place
  return {
    type: "hear",
    id,
    sentenceId: sentence.id,
    clips: correct === 1 ? [wrong, "falling"] : ["falling", wrong],
    correct,
  };
}

/**
 * The lesson's exercises, built from its sentences. Sentences are used in rotation so every sentence appears and the
 * same one rarely repeats back to back. Needs at least one sentence.
 */
export function buildExercises(sentences: readonly Sentence[], lessonId: string): Exercise[] {
  if (sentences.length === 0) throw new Error(`Lesson ${lessonId} has no sentences`);
  let cursor = 0;
  let hearCount = 0;
  return PLAN.map((type, i) => {
    const sentence = sentences[cursor++ % sentences.length];
    const id = `${lessonId}-${i + 1}-${type}`;
    if (type === "hear") return makeHear(sentence, hearCount++, id);
    return { type, id, sentenceId: sentence.id };
  });
}

/** When there is no microphone, a "shadow it" exercise becomes a listening exercise on the same sentence. */
export function listeningFallback(exercise: ShadowExercise, sentence: Sentence): HearExercise {
  return makeHear(sentence, 0, `${exercise.id}-listen`);
}

// Exercise generation for the lesson player. Pure and deterministic: the same sentences always give the same lesson,
// so server and client render the same first screen and tests can pin the order.

import type { Sentence } from "../intonation/types.ts";

/**
 * How a practice clip sounds. The first two name how the clip ENDS:
 *  - falling: ends low (the textbook tune of a statement, command or wh-question; the typical mistake on a yes/no question)
 *  - rising: ends up (the textbook tune of a yes/no question, a name or an interjection; the typical mistake on a wh-question)
 *  - flat: monotone, no clear peak
 *  - busy: a little rise on every stressed word ("a tone on every word")
 * Which of "falling" and "rising" is the textbook one depends on the sentence: see `endingOf`.
 */
export type ClipVariant = "falling" | "rising" | "flat" | "busy";

/** How a sentence ends when it is said the textbook way. */
export type Ending = "falling" | "rising";

/** The textbook ending of a sentence: rising when its last thought group is a 2-3 group, falling otherwise. */
export function endingOf(sentence: Sentence): Ending {
  return sentence.groups[sentence.groups.length - 1].pattern === "2-3" ? "rising" : "falling";
}

export interface HearExercise {
  type: "hear";
  id: string;
  sentenceId: string;
  /** Which tune the learner is asked to find: "Which one is the falling / rising tune?". */
  ask: Ending;
  /** The two clips, in the order shown (A, B). */
  clips: [ClipVariant, ClipVariant];
  /** Index (0 = A, 1 = B) of the clip that has the asked-for ending (`clips[correct] === ask`). */
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
 * Lessons whose "Hear it" exercises alternate between asking for the rising and the falling clip. Every other lesson asks
 * for the sentence's own textbook ending. (Listed here, not in the lesson file, because the lesson player builds its
 * exercises from `buildExercises(sentences, lessonId)` alone.)
 */
export const MIXED_HEAR_LESSONS: readonly string[] = ["rising-2"];

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
  const pool: readonly ClipVariant[] = rising ? ["falling", "flat"] : ["rising", "flat", "busy"];
  for (let i = 0; i < pool.length; i++) {
    const d = pool[(k + i) % pool.length];
    if (d !== "busy" || hasBusyVariant(sentence)) return d;
  }
  return rising ? "falling" : "rising";
}

/**
 * A "hear it" exercise; `k` decides which mistake is the distractor and whether the right clip is A or B.
 * `ask` is the tune the learner must find (default: the sentence's textbook ending). Asking for the OTHER ending
 * ("which one falls?" on a yes/no question) pairs the mistake with the textbook clip.
 */
export function makeHear(sentence: Sentence, k: number, id: string, ask?: Ending): HearExercise {
  const textbook = endingOf(sentence);
  const wanted = ask ?? textbook;
  const other: ClipVariant = wanted === textbook ? distractorFor(sentence, k) : textbook;
  const correct: 0 | 1 = k % 2 === 0 ? 1 : 0; // B, A, B ...: the answer is not always in the same place
  return {
    type: "hear",
    id,
    sentenceId: sentence.id,
    ask: wanted,
    clips: correct === 1 ? [other, wanted] : [wanted, other],
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
  let cursor = 0;
  let hearCount = 0;
  return PLAN.map((type, i) => {
    const sentence = sentences[cursor++ % sentences.length];
    const id = `${lessonId}-${i + 1}-${type}`;
    if (type === "hear") {
      const k = hearCount++;
      const textbook = endingOf(sentence);
      const ask: Ending = mixed && k % 2 === 1 ? (textbook === "rising" ? "falling" : "rising") : textbook;
      return makeHear(sentence, k, id, ask);
    }
    return { type, id, sentenceId: sentence.id };
  });
}

/** When there is no microphone, a "shadow it" exercise becomes a listening exercise on the same sentence. */
export function listeningFallback(exercise: ShadowExercise, sentence: Sentence): HearExercise {
  return makeHear(sentence, 0, `${exercise.id}-listen`);
}

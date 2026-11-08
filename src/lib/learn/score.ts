// Scoring for the lesson player: one outcome per exercise, one summary per lesson. Pure.

import { starsFor } from "../progress/store.ts";
import type { ExerciseType } from "./exercises.ts";

/** A drawing or recording this good (engine score) counts as "Nice!". */
export const PASS_SCORE = 70;

export interface ExerciseOutcome {
  exerciseId: string;
  type: ExerciseType;
  /** 0–100. Right/wrong exercises give 100 or 0; draw and shadow use the rule engine's overall score. */
  score: number;
  passed: boolean;
}

export interface LessonSummary {
  /** Mean exercise score, 0–100. */
  score: number;
  stars: number;
  xp: number;
  passed: number;
  total: number;
}

export function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));
}

/** Outcome of an exercise that is simply right or wrong (hear it, find the peak). */
export function rightWrong(exerciseId: string, type: ExerciseType, right: boolean): ExerciseOutcome {
  return { exerciseId, type, score: right ? 100 : 0, passed: right };
}

/**
 * Outcome of an exercise graded by the rule engine (draw it, shadow it). `passed` defaults to "score reaches the pass mark";
 * the player passes the feedback's verdict instead, which also requires that no check failed.
 */
export function graded(exerciseId: string, type: ExerciseType, overall: number, passed?: boolean): ExerciseOutcome {
  const score = clampScore(overall);
  return { exerciseId, type, score, passed: passed ?? score >= PASS_SCORE };
}

/** XP for a finished lesson: 10 for finishing, up to 20 for the score, 5 more when every exercise was passed. */
export function xpFor(score: number, passed: number, total: number): number {
  return 10 + Math.round(clampScore(score) / 5) + (total > 0 && passed === total ? 5 : 0);
}

export function summarize(outcomes: readonly ExerciseOutcome[]): LessonSummary {
  const total = outcomes.length;
  const passed = outcomes.filter((o) => o.passed).length;
  const score = total === 0 ? 0 : clampScore(outcomes.reduce((n, o) => n + o.score, 0) / total);
  return { score, stars: starsFor(score), xp: total === 0 ? 0 : xpFor(score, passed, total), passed, total };
}

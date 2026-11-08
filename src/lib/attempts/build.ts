// Turn an exercise result into an `attempts` row (SPEC section 7) and the per-skill results that feed skill mastery.
// Pure. Only numbers and statuses ever leave here: no audio, no drawing strokes, no recordings.

import type { AnalysisResult, PatternId, Sentence } from "../intonation/types.ts";
import type { MasteryModality, SkillResult } from "../mastery/mastery.ts";

/** One row of the `attempts` table, minus `id` and `user_id` (the server sets those). */
export interface AttemptRow {
  sentence_id: string;
  modality: MasteryModality;
  /** The sentence's own pattern: the pattern of its last thought group. */
  pattern: PatternId;
  /** Rounded [start, end] level per syllable when timing is known (drawings), else null. */
  levels: number[][] | null;
  /** Every check of the attempt: the thought groups' checks in order, then the sentence-level checks. */
  checks: { id: string; status: string }[];
  /** Mean DTW shape similarity over the thought groups, 0–100; null for listening. */
  shape_score: number | null;
  /** 0–100. */
  overall: number;
  /** ISO time the learner pressed CHECK (kept so an offline attempt flushed later keeps its real time). */
  created_at: string;
}

export interface BuiltAttempt {
  row: AttemptRow;
  /** Pattern x skill x modality results for skill mastery (each group's checks count toward that group's pattern). */
  skills: SkillResult[];
}

function sentencePattern(sentence: Sentence): PatternId {
  return sentence.groups[sentence.groups.length - 1].pattern;
}

const clamp100 = (n: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));

/** A drawing or a recording, graded by the rule engine. */
export function buildAttempt(
  sentence: Sentence,
  analysis: AnalysisResult,
  modality: "speak" | "draw",
  now: Date = new Date(),
): BuiltAttempt {
  const checks: AttemptRow["checks"] = [];
  const skills: SkillResult[] = [];
  for (const g of analysis.groups) {
    for (const c of g.checks) {
      checks.push({ id: c.id, status: c.status });
      skills.push({ pattern: g.pattern, skill: c.id, modality, status: c.status });
    }
  }
  const whole = sentencePattern(sentence);
  for (const c of analysis.sentenceChecks) {
    checks.push({ id: c.id, status: c.status });
    skills.push({ pattern: whole, skill: c.id, modality, status: c.status });
  }
  const shapes = analysis.groups.map((g) => g.shapeScore).filter((n) => Number.isFinite(n));
  return {
    row: {
      sentence_id: sentence.id,
      modality,
      pattern: whole,
      levels: analysis.syllableLevels ? analysis.syllableLevels.map((l) => [...l]) : null,
      checks,
      shape_score: shapes.length ? clamp100(shapes.reduce((a, b) => a + b, 0) / shapes.length) : null,
      overall: clamp100(analysis.overall),
      created_at: now.toISOString(),
    },
    skills,
  };
}

/** Hear it / Find the peak: right or wrong, recorded as the "listening" skill. */
export function buildListenAttempt(sentence: Sentence, passed: boolean, now: Date = new Date()): BuiltAttempt {
  const pattern = sentencePattern(sentence);
  const status = passed ? "pass" : "fail";
  return {
    row: {
      sentence_id: sentence.id,
      modality: "listen",
      pattern,
      levels: null,
      checks: [{ id: "listening", status }],
      shape_score: null,
      overall: passed ? 100 : 0,
      created_at: now.toISOString(),
    },
    skills: [{ pattern, skill: "listening", modality: "listen", status }],
  };
}

/** The row for `attempts`, shaped exactly like the table. */
export function buildAttemptRow(
  sentence: Sentence,
  analysis: AnalysisResult,
  modality: "speak" | "draw",
  now: Date = new Date(),
): AttemptRow {
  return buildAttempt(sentence, analysis, modality, now).row;
}

/**
 * Skill results from a bare row, for callers that only have the row. Every check counts toward the row's pattern, so
 * for a multi-group sentence `buildAttempt`'s own `skills` (which use each group's pattern) are more precise.
 */
export function skillsFromRow(row: AttemptRow): SkillResult[] {
  const known = new Set(["pass", "warn", "fail", "skip"]);
  return row.checks
    .filter((c) => known.has(c.status))
    .map((c) => ({
      pattern: row.pattern,
      skill: c.id as SkillResult["skill"],
      modality: row.modality,
      status: c.status as SkillResult["status"],
    }));
}

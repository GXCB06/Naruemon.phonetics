// Draw it grades per pattern (Perfect / Good / Miss), for My Progress. Pure functions + a tiny localStorage wrapper
// that never throws, like store.ts.
//
// The attempts queue (myna.attempts.v1) empties once attempts reach Supabase, so it cannot hold a running count. This
// tally (myna.drawGrades.v1) only ever grows on this device. A signed-in learner's server rows give a second tally;
// `mergeGradeTallies` keeps, per pattern, whichever side rests on more drawings, so nothing is counted twice.

import { DRAW_GRADES, isDrawGrade, type DrawGrade } from "../attempts/build.ts";

export type GradeCounts = Record<DrawGrade, number>;
/** pattern → counts. */
export type GradeTally = Record<string, GradeCounts>;

export const DRAW_GRADES_KEY = "myna.drawGrades.v1";

export function emptyCounts(): GradeCounts {
  return { perfect: 0, good: 0, miss: 0 };
}

export function countsTotal(c: GradeCounts): number {
  return c.perfect + c.good + c.miss;
}

/** One more drawing of `pattern` with this grade. Returns a new tally. */
export function addDrawGrade(tally: GradeTally, pattern: string, grade: DrawGrade): GradeTally {
  const prev = tally[pattern] ?? emptyCounts();
  return { ...tally, [pattern]: { ...prev, [grade]: prev[grade] + 1 } };
}

/** Tally from attempt rows (local queue or server); rows that are not graded drawings are ignored. */
export function tallyFromRows(rows: readonly { pattern: string; modality?: string; draw_grade?: unknown }[]): GradeTally {
  let t: GradeTally = {};
  for (const r of rows) {
    if (r.modality !== undefined && r.modality !== "draw") continue;
    if (isDrawGrade(r.draw_grade)) t = addDrawGrade(t, r.pattern, r.draw_grade);
  }
  return t;
}

/** Per pattern, the side with more drawings (ties: local). Neither tally is changed. */
export function mergeGradeTallies(local: GradeTally, remote: GradeTally): GradeTally {
  const out: GradeTally = { ...local };
  for (const [pattern, r] of Object.entries(remote)) {
    const l = out[pattern];
    if (!l || countsTotal(r) > countsTotal(l)) out[pattern] = r;
  }
  return out;
}

function validCounts(x: unknown): x is GradeCounts {
  const c = x as GradeCounts | null;
  return !!c && typeof c === "object" && DRAW_GRADES.every((g) => Number.isFinite(c[g]) && c[g] >= 0);
}

/** Parse stored JSON; anything malformed is dropped. */
export function parseGradeTally(raw: string | null | undefined): GradeTally {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: GradeTally = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (validCounts(v)) out[k] = { perfect: v.perfect, good: v.good, miss: v.miss };
    }
    return out;
  } catch {
    return {};
  }
}

type Store = Pick<Storage, "getItem" | "setItem">;

function defaultStore(): Store | undefined {
  try {
    return typeof localStorage !== "undefined" ? localStorage : undefined;
  } catch {
    return undefined;
  }
}

export function loadGradeTally(storage?: Store): GradeTally {
  try {
    return parseGradeTally((storage ?? defaultStore())?.getItem(DRAW_GRADES_KEY));
  } catch {
    return {};
  }
}

export function saveGradeTally(tally: GradeTally, storage?: Store): void {
  try {
    (storage ?? defaultStore())?.setItem(DRAW_GRADES_KEY, JSON.stringify(tally));
  } catch {
    // storage full or unavailable
  }
}

/** Load, add one drawing, save. Never throws. */
export function recordDrawGrade(pattern: string, grade: DrawGrade, storage?: Store): void {
  saveGradeTally(addDrawGrade(loadGradeTally(storage), pattern, grade), storage);
}

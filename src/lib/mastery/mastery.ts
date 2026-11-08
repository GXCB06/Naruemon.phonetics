// Skill mastery (SPEC D2): one exponentially weighted score per pattern x skill x modality. Pure: no DOM, no React.
//
// Why a moving average: recent attempts should count more than old ones, so a learner who has fixed a habit sees
// their score climb quickly instead of being dragged down by their first week. Everything here is a first guess
// (like the engine thresholds) and lives in the constants below so it is easy to tune with real data.

import type { CheckId, CheckStatus, PatternId } from "../intonation/types.ts";

/** Skills = the rule engine's check ids plus "listening" (Hear it / Find the peak). */
export type Skill = CheckId | "listening";
export type MasteryModality = "speak" | "draw" | "listen";

export const SKILLS: readonly Skill[] = ["start", "singlePeak", "peakPlacement", "ending", "range", "break", "listening"];
export const MODALITIES: readonly MasteryModality[] = ["speak", "draw", "listen"];

/** What one attempt says about one skill. */
export interface SkillResult {
  pattern: PatternId;
  skill: Skill;
  modality: MasteryModality;
  status: CheckStatus;
}

export interface MasteryEntry {
  /** 0–100, exponentially weighted. */
  score: number;
  /** Counted attempts (a "skip" is not counted). */
  attemptsN: number;
  /** ISO time of the last counted attempt. */
  lastSeen: string | null;
}

/** All entries, keyed by `skillKey(...)` ("pattern|skill|modality"). Plain JSON so it fits in localStorage. */
export type MasteryMap = Record<string, MasteryEntry>;

/** Weight of the newest attempt. 0.3 means roughly the last 5 to 6 attempts carry most of the score. */
export const ALPHA = 0.3;
/** Below this many attempts a skill shows "not enough data yet". */
export const MIN_ATTEMPTS = 5;
/** Attempts after which confidence reaches 100%. */
export const FULL_CONFIDENCE_ATTEMPTS = 10;

/** pass = 100, warn = 50, fail = 0; skip carries no information. */
export function statusPoints(status: CheckStatus): number | null {
  if (status === "pass") return 100;
  if (status === "warn") return 50;
  if (status === "fail") return 0;
  return null;
}

export function skillKey(pattern: string, skill: string, modality: string): string {
  return `${pattern}|${skill}|${modality}`;
}

export function parseSkillKey(key: string): { pattern: string; skill: string; modality: string } | null {
  const [pattern, skill, modality, ...rest] = key.split("|");
  if (!pattern || !skill || !modality || rest.length > 0) return null;
  return { pattern, skill, modality };
}

/**
 * Fold one attempt into a skill's entry. The first counted attempt sets the score; after that
 * `score = score + ALPHA * (points - score)`. A "skip" (or an unknown status) returns `prev` untouched, so it never
 * creates an entry or moves a score.
 */
export function updateMastery(
  prev: MasteryEntry | undefined,
  attempt: { status: CheckStatus; at?: string | Date },
): MasteryEntry | undefined {
  const points = statusPoints(attempt.status);
  if (points === null) return prev;
  const at = attempt.at instanceof Date ? attempt.at.toISOString() : (attempt.at ?? new Date().toISOString());
  const attemptsN = (prev?.attemptsN ?? 0) + 1;
  const score = prev && prev.attemptsN > 0 ? prev.score + ALPHA * (points - prev.score) : points;
  return { score: round1(score), attemptsN, lastSeen: at };
}

/** Apply several results (one attempt) to a whole map. Returns a new map; `mastery` is not changed. */
export function applyResults(mastery: MasteryMap, results: readonly SkillResult[], at?: string | Date): MasteryMap {
  const next: MasteryMap = { ...mastery };
  for (const r of results) {
    const key = skillKey(r.pattern, r.skill, r.modality);
    const entry = updateMastery(next[key], { status: r.status, at });
    if (entry) next[key] = entry;
  }
  return next;
}

/** How much to trust a score: 0 with no attempts, 1 from FULL_CONFIDENCE_ATTEMPTS on. */
export function confidence(attemptsN: number): number {
  if (!Number.isFinite(attemptsN) || attemptsN <= 0) return 0;
  return Math.min(1, round2(attemptsN / FULL_CONFIDENCE_ATTEMPTS));
}

export function hasEnoughData(attemptsN: number): boolean {
  return attemptsN >= MIN_ATTEMPTS;
}

/** The score to show, or null while there is "not enough data yet". */
export function visibleScore(entry: MasteryEntry | undefined): number | null {
  return entry && hasEnoughData(entry.attemptsN) ? entry.score : null;
}

export const NOT_ENOUGH_DATA = { en: "Not enough data yet", th: "ยังมีข้อมูลไม่พอ" } as const;

export interface WeakSkill extends MasteryEntry {
  pattern: string;
  skill: string;
  modality: string;
}

/** The n lowest-scoring skills that have enough data (ties: the one practised longest ago first). */
export function topWeakSkills(mastery: MasteryMap, n = 3): WeakSkill[] {
  const out: WeakSkill[] = [];
  for (const [key, entry] of Object.entries(mastery)) {
    const parsed = parseSkillKey(key);
    if (!parsed || !hasEnoughData(entry.attemptsN)) continue;
    out.push({ ...parsed, ...entry });
  }
  out.sort((a, b) => a.score - b.score || (a.lastSeen ?? "").localeCompare(b.lastSeen ?? "") || a.skill.localeCompare(b.skill));
  return out.slice(0, Math.max(0, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

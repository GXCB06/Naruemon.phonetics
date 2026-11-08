// Drawing vs speaking insight (SPEC D3): the key personal feature. Pure.
// Comparing how well a learner can DRAW a pattern with how well they can SAY it tells them what to practise next.

import type { Bilingual } from "../intonation/types.ts";
import { hasEnoughData, parseSkillKey, type MasteryMap } from "./mastery.ts";

export type InsightState = "train-voice" | "learn-rule" | "review-unit" | "mastered";

export interface Insight {
  state: InsightState;
  /** Mean score (0–100) over the skills with enough data, per modality. */
  draw: number;
  speak: number;
  text: Bilingual;
}

/** A modality scores "high" from here up. */
export const HIGH_SCORE = 70;

export const INSIGHT_TEXT: Record<InsightState, Bilingual> = {
  "train-voice": {
    en: "You know the pattern; now train your voice",
    th: "คุณรู้รูปแบบแล้ว ต่อไปฝึกใช้เสียงของคุณ",
  },
  "learn-rule": {
    en: "Your voice is good; learn the rule so it stays consistent",
    th: "เสียงของคุณดีแล้ว เรียนรู้กฎเพื่อให้พูดได้สม่ำเสมอ",
  },
  "review-unit": {
    en: "Start here: review the unit",
    th: "เริ่มที่นี่: ทบทวนบทเรียนของหน่วยนี้",
  },
  mastered: {
    en: "Mastered",
    th: "เชี่ยวชาญแล้ว",
  },
};

/** Mean score of one modality for a pattern, over skills with enough data; null when there is none. */
export function patternScore(mastery: MasteryMap, pattern: string, modality: "speak" | "draw"): number | null {
  let sum = 0;
  let n = 0;
  for (const [key, entry] of Object.entries(mastery)) {
    const p = parseSkillKey(key);
    if (!p || p.pattern !== pattern || p.modality !== modality || !hasEnoughData(entry.attemptsN)) continue;
    sum += entry.score;
    n += 1;
  }
  return n === 0 ? null : sum / n;
}

export function insightState(draw: number, speak: number): InsightState {
  const d = draw >= HIGH_SCORE;
  const s = speak >= HIGH_SCORE;
  if (d && s) return "mastered";
  if (d) return "train-voice";
  if (s) return "learn-rule";
  return "review-unit";
}

/**
 * Compare drawing with speaking for one pattern. Returns null until BOTH modalities have enough data (5+ attempts on
 * at least one skill each): an insight built on one side only would be a guess.
 */
export function insightFor(pattern: string, skillScores: MasteryMap): Insight | null {
  const draw = patternScore(skillScores, pattern, "draw");
  const speak = patternScore(skillScores, pattern, "speak");
  if (draw === null || speak === null) return null;
  const state = insightState(draw, speak);
  return { state, draw: Math.round(draw), speak: Math.round(speak), text: INSIGHT_TEXT[state] };
}

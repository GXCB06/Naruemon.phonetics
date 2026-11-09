// Shaping logic for the My Progress screen (SPEC D4). Pure: no DOM, no React, no clock (callers pass `now`).
// It only turns mastery + attempts data into rows, labels and numbers; the components just draw them.

import type { Bilingual } from "../intonation/types.ts";
import type { QueuedAttempt } from "../attempts/queue.ts";
import { UNITS, type UnitMeta } from "../course/units.ts";
import { HIGH_SCORE, insightFor, type Insight } from "../mastery/insight.ts";
import {
  MIN_ATTEMPTS,
  SKILLS,
  hasEnoughData,
  parseSkillKey,
  skillKey,
  topWeakSkills,
  type MasteryEntry,
  type MasteryMap,
  type MasteryModality,
  type Skill,
} from "../mastery/mastery.ts";

// ---------------------------------------------------------------------------------------------------------------------
// Labels (every user-facing string is bilingual)

/** Patterns in the order the course teaches them. */
export const PATTERN_ORDER = ["2-3-1", "2-3", "2-3-2", "3-1"] as const;

export const PATTERN_LABEL: Record<string, Bilingual> = {
  "2-3-1": { en: "Falling 2-3-1", th: "เสียงตก 2-3-1" },
  "2-3": { en: "Rising 2-3", th: "เสียงขึ้น 2-3" },
  "2-3-2": { en: "Non-final 2-3-2", th: "ยังไม่จบ 2-3-2" },
  "3-1": { en: "Sure tag 3-1", th: "Tag แบบมั่นใจ 3-1" },
};

export const SKILL_LABEL: Record<Skill, Bilingual> = {
  start: { en: "Start", th: "จุดเริ่ม" },
  singlePeak: { en: "One peak", th: "ยอดเดียว" },
  peakPlacement: { en: "Peak position", th: "ตำแหน่งยอด" },
  ending: { en: "Ending", th: "ท้ายประโยค" },
  range: { en: "Range", th: "ช่วงเสียง" },
  break: { en: "Pause", th: "การเว้นวรรค" },
  listening: { en: "Listening", th: "การฟัง" },
};

export const MODALITY_LABEL: Record<MasteryModality, Bilingual> = {
  speak: { en: "Speak", th: "พูด" },
  draw: { en: "Draw", th: "วาด" },
  listen: { en: "Listen", th: "ฟัง" },
};

export type Band = "none" | "few" | "low" | "mid" | "high";

export const BAND_LABEL: Record<Band, Bilingual> = {
  none: { en: "No attempts yet", th: "ยังไม่เคยลอง" },
  few: { en: "Not enough data yet", th: "ยังมีข้อมูลไม่พอ" },
  low: { en: "Needs work", th: "ต้องฝึกเพิ่ม" },
  mid: { en: "Getting there", th: "ใกล้แล้ว" },
  high: { en: "Strong", th: "แข็งแรง" },
};

/** Scores below this are "needs work"; from HIGH_SCORE up they are "strong". */
export const LOW_SCORE = 50;

export function bandFor(entry: MasteryEntry | undefined): Band {
  if (!entry || entry.attemptsN <= 0) return "none";
  if (!hasEnoughData(entry.attemptsN)) return "few";
  if (entry.score >= HIGH_SCORE) return "high";
  if (entry.score >= LOW_SCORE) return "mid";
  return "low";
}

// ---------------------------------------------------------------------------------------------------------------------
// Heat map

export interface HeatPart {
  modality: MasteryModality;
  /** The 0–100 score to show, or null while there is none ("none" / "few"). */
  score: number | null;
  attemptsN: number;
  band: Band;
}

export interface HeatCell {
  skill: Skill;
  parts: HeatPart[];
}

export interface HeatRow {
  pattern: string;
  label: Bilingual;
  cells: HeatCell[];
}

/** Listening is only ever listened; every other skill is spoken or drawn. */
function modalitiesFor(skill: Skill): MasteryModality[] {
  return skill === "listening" ? ["listen"] : ["speak", "draw"];
}

/** Patterns the learner has met: any counted attempt on any skill. Known patterns first (course order), then others. */
export function metPatterns(mastery: MasteryMap): string[] {
  const met = new Set<string>();
  for (const [key, entry] of Object.entries(mastery)) {
    const p = parseSkillKey(key);
    if (p && entry.attemptsN > 0) met.add(p.pattern);
  }
  const known = PATTERN_ORDER.filter((p) => met.has(p));
  const other = [...met].filter((p) => !(PATTERN_ORDER as readonly string[]).includes(p)).sort();
  return [...known, ...other];
}

/** Rows = patterns met, columns = SKILLS, each cell split by modality. */
export function buildHeatMap(mastery: MasteryMap): HeatRow[] {
  return metPatterns(mastery).map((pattern) => ({
    pattern,
    label: PATTERN_LABEL[pattern] ?? { en: `Pattern ${pattern}`, th: `รูปแบบ ${pattern}` },
    cells: SKILLS.map((skill) => ({
      skill,
      parts: modalitiesFor(skill).map((modality) => {
        const entry = mastery[skillKey(pattern, skill, modality)];
        const band = bandFor(entry);
        return {
          modality,
          score: entry && hasEnoughData(entry.attemptsN) ? Math.round(entry.score) : null,
          attemptsN: entry?.attemptsN ?? 0,
          band,
        };
      }),
    })),
  }));
}

// ---------------------------------------------------------------------------------------------------------------------
// Merging mastery from this device with the server's rows

/**
 * Combine two mastery maps. For a skill that exists in both, keep the entry resting on more attempts (ties: the more
 * recently practised one). Neither map is changed.
 */
export function mergeMastery(local: MasteryMap, remote: MasteryMap): MasteryMap {
  const out: MasteryMap = { ...local };
  for (const [key, r] of Object.entries(remote)) {
    const l = out[key];
    if (!l) {
      out[key] = r;
    } else if (r.attemptsN > l.attemptsN || (r.attemptsN === l.attemptsN && (r.lastSeen ?? "") > (l.lastSeen ?? ""))) {
      out[key] = r;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Where "Practice this" goes

/** The units that train each pattern, best match first. Static on purpose: a dynamic review lesson comes later. */
const PATTERN_UNITS: Record<string, string[]> = {
  "2-3-1": ["falling"],
  "2-3": ["rising", "lists"],
  "2-3-2": ["nonfinal"],
  "3-1": ["tags"],
};

export interface PracticeTarget {
  unitId: string;
  lessonId: string;
  href: string;
}

/** The first lesson of the first open unit that trains `pattern`, or null (no unit, still locked, or no lessons yet). */
export function practiceTarget(pattern: string, units: readonly UnitMeta[] = UNITS): PracticeTarget | null {
  for (const unitId of PATTERN_UNITS[pattern] ?? []) {
    const unit = units.find((u) => u.id === unitId);
    const lesson = unit && !unit.locked ? unit.lessons[0] : undefined;
    if (unit && lesson) return { unitId: unit.id, lessonId: lesson.id, href: `/learn/${unit.id}/${lesson.id}` };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Top things to improve

/** How a pattern is named inside a sentence ("Your yes/no questions ..."). */
const SUBJECT: Record<string, Bilingual> = {
  "2-3-1": { en: "statements and wh-questions", th: "ประโยคบอกเล่าและคำถาม Wh-" },
  "2-3": { en: "yes/no questions", th: "คำถาม Yes/No" },
  "2-3-2": { en: "unfinished clauses", th: "อนุประโยคที่ยังพูดไม่จบ" },
  "3-1": { en: "sure tag questions", th: "tag question แบบมั่นใจ" },
};

/** The "ending" skill means something different for each pattern, so those four are written out. */
const ENDING_SENTENCE: Record<string, Bilingual> = {
  "2-3-1": {
    en: "Your statements and wh-questions don't fall low at the end",
    th: "ประโยคบอกเล่าและคำถาม Wh- ของคุณไม่ได้ลงเสียงต่ำตอนท้าย",
  },
  "2-3": {
    en: "Your yes/no questions go down at the end",
    th: "คำถาม Yes/No ของคุณลงเสียงตอนท้าย ทั้งที่ควรขึ้น",
  },
  "2-3-2": {
    en: "Your unfinished clauses don't come back to mid at the end",
    th: "อนุประโยคที่ยังพูดไม่จบของคุณไม่ได้กลับมาที่ระดับกลางตอนท้าย",
  },
  "3-1": {
    en: "Your sure tag questions don't fall from high to low",
    th: "tag question แบบมั่นใจของคุณไม่ได้ลงจากสูงไปต่ำ",
  },
};

/** A plain sentence about one weak skill of one pattern, or null for a pattern/skill this screen does not know. */
export function improvementSentence(pattern: string, skill: string): Bilingual | null {
  const s = SUBJECT[pattern];
  if (!s) return null;
  switch (skill as Skill) {
    case "ending":
      return ENDING_SENTENCE[pattern] ?? null;
    case "start":
      return { en: `Your ${s.en} don't start at the mid level`, th: `${s.th} ของคุณไม่ได้เริ่มที่ระดับกลาง` };
    case "singlePeak":
      return { en: `Your ${s.en} have more than one peak`, th: `${s.th} ของคุณมีมากกว่าหนึ่งยอดเสียง` };
    case "peakPlacement":
      return {
        en: `The peak in your ${s.en} isn't on the stressed syllable`,
        th: `ยอดเสียงใน${s.th} ของคุณไม่ได้อยู่ที่พยางค์เน้น`,
      };
    case "range":
      return { en: `Your ${s.en} sound flat; use a wider pitch range`, th: `${s.th} ของคุณฟังเรียบเกินไป ใช้ช่วงเสียงให้กว้างขึ้น` };
    case "break":
      return {
        en: `Your ${s.en} need clearer pauses between thought groups`,
        th: `${s.th} ของคุณต้องเว้นวรรคระหว่างกลุ่มความคิดให้ชัดขึ้น`,
      };
    case "listening":
      return { en: `You find it hard to hear the pattern in ${s.en}`, th: `คุณยังฟังรูปแบบเสียงของ${s.th} ได้ไม่ชัด` };
    default:
      return null;
  }
}

export interface Improvement {
  pattern: string;
  skill: string;
  modality: string;
  score: number;
  attemptsN: number;
  sentence: Bilingual;
  /** Always set: weak skills whose unit is locked (or has no lessons) are skipped. */
  target: PracticeTarget;
}

/**
 * The n weakest skills (enough data, score below HIGH_SCORE) that we can write a sentence for and that have an open
 * lesson to practise in. Skills of a locked unit are skipped, so every item has a working "Practice this" link.
 */
export function topImprovements(mastery: MasteryMap, n = 3, units: readonly UnitMeta[] = UNITS): Improvement[] {
  const out: Improvement[] = [];
  for (const w of topWeakSkills(mastery, Number.MAX_SAFE_INTEGER)) {
    if (out.length >= n) break;
    if (w.score >= HIGH_SCORE) break; // sorted by score: everything after this is strong too
    const sentence = improvementSentence(w.pattern, w.skill);
    const target = practiceTarget(w.pattern, units);
    if (!sentence || !target) continue;
    out.push({
      pattern: w.pattern,
      skill: w.skill,
      modality: w.modality,
      score: Math.round(w.score),
      attemptsN: w.attemptsN,
      sentence,
      target,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Drawing vs speaking

export interface PatternInsight {
  pattern: string;
  label: Bilingual;
  /** Null until both drawing and speaking have enough data. */
  insight: Insight | null;
}

export function buildInsights(mastery: MasteryMap): PatternInsight[] {
  return metPatterns(mastery).map((pattern) => ({
    pattern,
    label: PATTERN_LABEL[pattern] ?? { en: `Pattern ${pattern}`, th: `รูปแบบ ${pattern}` },
    insight: insightFor(pattern, mastery),
  }));
}

// ---------------------------------------------------------------------------------------------------------------------
// Trend

/** One graded attempt, from this device's queue or the server. */
export interface AttemptPoint {
  id: string;
  /** ISO time. */
  at: string;
  pattern: string;
  modality: string;
  /** 0–100. */
  overall: number;
}

/**
 * Listening attempts are a plain right/wrong (0 or 100), which is not comparable with a graded drawing or recording,
 * so the trend and the first-vs-latest numbers only use speak and draw.
 */
function isGraded(p: AttemptPoint): boolean {
  return (p.modality === "speak" || p.modality === "draw") && Number.isFinite(p.overall) && Number.isFinite(Date.parse(p.at));
}

export function pointsFromQueue(queue: readonly QueuedAttempt[]): AttemptPoint[] {
  return queue.map((q) => ({
    id: q.id,
    at: q.row.created_at,
    pattern: q.row.pattern,
    modality: q.row.modality,
    overall: q.row.overall,
  }));
}

/** Union of attempt lists by id (a queued attempt that was already flushed shows up on both sides). */
export function mergeAttemptPoints(...lists: readonly (readonly AttemptPoint[])[]): AttemptPoint[] {
  const byId = new Map<string, AttemptPoint>();
  for (const list of lists) for (const p of list) if (!byId.has(p.id)) byId.set(p.id, p);
  return [...byId.values()];
}

export interface TrendDay {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  /** Mean overall score of that day's graded attempts, or null for a day with none. */
  average: number | null;
  count: number;
}

function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** The last `days` local calendar days ending today (oldest first), each with the mean overall score. */
export function dailyTrend(points: readonly AttemptPoint[], now: Date, days = 14): TrendDay[] {
  const buckets = new Map<string, { sum: number; n: number }>();
  const out: TrendDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = dayKey(d);
    buckets.set(key, { sum: 0, n: 0 });
    out.push({ day: key, average: null, count: 0 });
  }
  for (const p of points) {
    if (!isGraded(p)) continue;
    const b = buckets.get(dayKey(new Date(p.at)));
    if (b) {
      b.sum += p.overall;
      b.n += 1;
    }
  }
  return out.map((t) => {
    const b = buckets.get(t.day)!;
    return b.n > 0 ? { day: t.day, average: Math.round(b.sum / b.n), count: b.n } : t;
  });
}

export interface FirstLatest {
  pattern: string;
  label: Bilingual;
  first: number;
  latest: number;
  delta: number;
  count: number;
}

/** "First vs latest attempt" per pattern, for patterns with at least 2 graded attempts. */
export function firstVsLatest(points: readonly AttemptPoint[]): FirstLatest[] {
  const byPattern = new Map<string, AttemptPoint[]>();
  for (const p of points) {
    if (!isGraded(p)) continue;
    const list = byPattern.get(p.pattern) ?? [];
    list.push(p);
    byPattern.set(p.pattern, list);
  }
  const rows: FirstLatest[] = [];
  const order = [...PATTERN_ORDER, ...[...byPattern.keys()].filter((k) => !(PATTERN_ORDER as readonly string[]).includes(k)).sort()];
  for (const pattern of order) {
    const list = byPattern.get(pattern);
    if (!list || list.length < 2) continue;
    // stable sort by time: attempts with equal timestamps keep their arrival order
    const sorted = [...list].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const first = Math.round(sorted[0].overall);
    const latest = Math.round(sorted[sorted.length - 1].overall);
    rows.push({
      pattern,
      label: PATTERN_LABEL[pattern] ?? { en: `Pattern ${pattern}`, th: `รูปแบบ ${pattern}` },
      first,
      latest,
      delta: latest - first,
      count: sorted.length,
    });
  }
  return rows;
}

export { MIN_ATTEMPTS };

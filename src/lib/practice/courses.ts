// The Practice hub: which sentences each course draws from, and how a 10-question drill is built. Pure and deterministic
// (same course + same seed = same drill), so the drill page can render on the server and the client alike.

import type { Bilingual, Sentence } from "../intonation/types.ts";
import { hasOpenGroup, isListSentence, makeBuild, type Exercise } from "../learn/exercises.ts";
import { hashSeed, seededShuffle } from "../learn/build.ts";
import type { LessonResult } from "../progress/store.ts";

export type CourseId = "falling" | "rising" | "nonfinal" | "lists" | "tags" | "class2" | "random";

export interface PracticeCourse {
  id: CourseId;
  title: Bilingual;
  /** The pattern shown big on the card ("2-3-1"), or a short mark for the mixed courses. */
  badge: string;
  blurb: Bilingual;
  /** 1–5: which unit colour the card uses (globals.css --u1 … --u5). */
  color: number;
}

export const COURSES: readonly PracticeCourse[] = [
  { id: "falling", title: { en: "Draw 2-3-1", th: "วาดเสียงตก 2-3-1" }, badge: "2-3-1", blurb: { en: "Statements, wh-questions, commands: peak, then fall.", th: "ประโยคบอกเล่า คำถาม Wh- คำสั่ง: ขึ้นสูงแล้วตก" }, color: 1 },
  { id: "rising", title: { en: "Draw 2-3", th: "วาดเสียงขึ้น 2-3" }, badge: "2-3", blurb: { en: "Yes/no questions and names: rise and stay up.", th: "คำถาม Yes/No และการเรียกชื่อ: ขึ้นแล้วค้างไว้" }, color: 2 },
  { id: "nonfinal", title: { en: "Draw 2-3-2", th: "วาดเสียงยังไม่จบ 2-3-2" }, badge: "2-3-2", blurb: { en: "Not finished yet: come back to 2, then the last part falls.", th: "ยังพูดไม่จบ: กลับมาที่ 2 ส่วนสุดท้ายถึงตก" }, color: 3 },
  { id: "lists", title: { en: "Lists & choices", th: "รายการและตัวเลือก" }, badge: "2-3 | 2-3-1", blurb: { en: "Rise on each item; a statement list falls on the last.", th: "ขึ้นเสียงทุกรายการ รายการสุดท้ายของประโยคบอกเล่าตก" }, color: 4 },
  { id: "tags", title: { en: "Tag questions", th: "Tag question" }, badge: "3-1 / 2-3", blurb: { en: "Sure falls, not sure rises.", th: "มั่นใจ = ตก ไม่แน่ใจ = ขึ้น" }, color: 5 },
  { id: "class2", title: { en: "Class Exercise 2", th: "แบบฝึกหัดในห้อง 2" }, badge: "14", blurb: { en: "The sheet from class: 25 mixed sentences.", th: "ใบงานจากในห้องเรียน: 25 ประโยคคละแบบ" }, color: 2 },
  { id: "random", title: { en: "Random quiz", th: "สุ่มทายทำนอง" }, badge: "?", blurb: { en: "10 mixed questions from every pattern.", th: "10 ข้อคละจากทุกรูปแบบ" }, color: 3 },
];

/** The Practice course that drills a mastery pattern ("2-3" -> rising), or null for a pattern with none. */
export function courseForPattern(pattern: string): CourseId | null {
  return { "2-3-1": "falling", "2-3": "rising", "2-3-2": "nonfinal", "3-1": "tags" }[pattern] as CourseId | undefined ?? null;
}

export function courseById(id: string): PracticeCourse | undefined {
  return COURSES.find((c) => c.id === id);
}

const isTag = (s: Sentence) => s.kind.startsWith("Tag question");

/** Sentences of the class sheet are those whose id starts with "class2-" (the pack in content/units/practice/class-2.json). */
const isClass2 = (s: Sentence) => s.id.startsWith("class2-");

/**
 * The sentences a course draws from, out of every sentence of the course (lessons and packs):
 *  - falling: one thought group, 2-3-1 (statements, wh-questions, commands, exclamations)
 *  - rising: every group 2-3 and not a list or choice (yes/no, names, interjections)
 *  - nonfinal: some group is open (2-3-2), not counting lists and choices
 *  - lists: lists and choices
 *  - tags: tag questions
 *  - class2: the class sheet; random: everything
 */
export function courseSentences(id: CourseId, all: readonly Sentence[]): Sentence[] {
  switch (id) {
    case "falling":
      return all.filter((s) => s.groups.length === 1 && s.groups[0].pattern === "2-3-1");
    case "rising":
      return all.filter((s) => !isListSentence(s) && s.groups.every((g) => g.pattern === "2-3"));
    case "nonfinal":
      return all.filter((s) => !isListSentence(s) && hasOpenGroup(s));
    case "lists":
      return all.filter(isListSentence);
    case "tags":
      return all.filter(isTag);
    case "class2":
      return all.filter(isClass2);
    case "random":
      return [...all];
  }
}

/** The 10 questions of a drill: mostly drawing, with a few find-the-peak and build-the-tune to rest the pen. */
export const DRILL_PLAN = ["peak", "draw", "build", "draw", "draw", "peak", "draw", "draw", "build", "draw"] as const;

export interface Drill {
  /** Also the id the result is saved under, so each course keeps its own best score. */
  id: string;
  /** The sentences used (each once, in first-use order); the player looks sentences up by id from these. */
  sentences: Sentence[];
  exercises: Exercise[];
}

export function drillId(course: CourseId): string {
  return `drill-${course}`;
}

/**
 * A drill for a course. The pool is shuffled by `seed` and walked in order, so the same sentence never comes back to back
 * and every sentence of a small pool is used before one repeats. An empty pool gives an empty drill.
 */
export function buildDrill(course: CourseId, seed: number, all: readonly Sentence[]): Drill {
  const id = drillId(course);
  const pool = courseSentences(course, all);
  if (pool.length === 0) return { id, sentences: [], exercises: [] };
  const order = seededShuffle(pool, hashSeed(`${course}:${seed}`));
  const used: Sentence[] = [];
  const exercises = DRILL_PLAN.map((type, i): Exercise => {
    const sentence = order[i % order.length];
    if (!used.includes(sentence)) used.push(sentence);
    const exId = `${id}-${i + 1}-${type}`;
    return type === "build" ? makeBuild(sentence, exId) : { type, id: exId, sentenceId: sentence.id };
  });
  return { id, sentences: used, exercises };
}

// ---------------------------------------------------------------------------------------------------------------
// What a course card shows
// ---------------------------------------------------------------------------------------------------------------

export interface CourseStat {
  /** Best drill score 0–100, or null when never practised. */
  best: number | null;
  /** 0–3 stars from the best score. */
  stars: number;
  /** ISO time of the last finished drill, or null. */
  lastAt: string | null;
  /** How many sentences the course has. */
  size: number;
}

export function courseStat(course: CourseId, all: readonly Sentence[], lessons: Record<string, LessonResult>): CourseStat {
  const r = Object.hasOwn(lessons, drillId(course)) ? lessons[drillId(course)] : undefined;
  return {
    best: r ? Math.max(0, Math.min(100, Math.round(r.best))) : null,
    stars: r ? Math.max(0, Math.min(3, Math.round(r.stars))) : 0,
    lastAt: r?.completedAt ?? null,
    size: courseSentences(course, all).length,
  };
}

/** "Needs work": practised, but the best drill is under 70% (the pass mark). Never-practised courses are "new". */
export function courseStatus(stat: CourseStat): "new" | "needs-work" | "good" | "mastered" {
  if (stat.best === null) return "new";
  if (stat.best >= 90) return "mastered";
  return stat.best >= 70 ? "good" : "needs-work";
}

/** Whole days between an ISO time and now (0 = today), or null for no time. */
export function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.max(0, Math.round((day(now) - day(new Date(t))) / 86_400_000));
}

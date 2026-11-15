// The Practice hub: which sentences each course draws from, and how a 10-question drill is built. Pure and deterministic
// (same course + same seed = same drill), so the drill page can render on the server and the client alike.

import type { Bilingual, Sentence } from "../intonation/types.ts";
import { hasOpenGroup, isListSentence, makeBuild, type Exercise } from "../learn/exercises.ts";
import { hashSeed, seededShuffle } from "../learn/build.ts";
import type { LessonResult } from "../progress/store.ts";

export type CourseId =
  | "falling"
  | "rising"
  | "nonfinal"
  | "lists"
  | "tags"
  | "class2"
  | "random"
  // Short mixed sessions on 2-3-1 (see SESSION_PLAN / DRAW3_PLAN below).
  | "session"
  | "draw3a"
  | "draw3b"
  | "speak3";

export interface PracticeCourse {
  id: CourseId;
  title: Bilingual;
  /** The pattern shown big on the card ("2-3-1"), or a short mark for the mixed courses. */
  badge: string;
  blurb: Bilingual;
  /** 1–5: which unit colour the card uses (globals.css --u1 … --u5). */
  color: number;
  /** A short session with its own fixed plan (see PLAN_BY_COURSE) instead of the 10-question DRILL_PLAN. */
  session?: boolean;
}

export const COURSES: readonly PracticeCourse[] = [
  { id: "falling", title: { en: "Draw 2-3-1", th: "วาดเสียงตก 2-3-1" }, badge: "2-3-1", blurb: { en: "Statements, wh-questions, commands: peak, then fall.", th: "ประโยคบอกเล่า คำถาม Wh- คำสั่ง: ขึ้นสูงแล้วตก" }, color: 1 },
  { id: "rising", title: { en: "Draw 2-3", th: "วาดเสียงขึ้น 2-3" }, badge: "2-3", blurb: { en: "Yes/no questions and names: rise and stay up.", th: "คำถาม Yes/No และการเรียกชื่อ: ขึ้นแล้วค้างไว้" }, color: 2 },
  { id: "nonfinal", title: { en: "Draw 2-3-2", th: "วาดเสียงยังไม่จบ 2-3-2" }, badge: "2-3-2", blurb: { en: "Not finished yet: come back to 2, then the last part falls.", th: "ยังพูดไม่จบ: กลับมาที่ 2 ส่วนสุดท้ายถึงตก" }, color: 3 },
  { id: "lists", title: { en: "Lists & choices", th: "รายการและตัวเลือก" }, badge: "2-3 | 2-3-1", blurb: { en: "Rise on each item; a statement list falls on the last.", th: "ขึ้นเสียงทุกรายการ รายการสุดท้ายของประโยคบอกเล่าตก" }, color: 4 },
  { id: "tags", title: { en: "Tag questions", th: "Tag question" }, badge: "3-1 / 2-3", blurb: { en: "Sure falls, not sure rises.", th: "มั่นใจ = ตก ไม่แน่ใจ = ขึ้น" }, color: 5 },
  { id: "class2", title: { en: "Class Exercise 2", th: "แบบฝึกหัดในห้อง 2" }, badge: "14", blurb: { en: "The sheet from class: 25 mixed sentences.", th: "ใบงานจากในห้องเรียน: 25 ประโยคคละแบบ" }, color: 2 },
  { id: "random", title: { en: "Random quiz", th: "สุ่มทายทำนอง" }, badge: "?", blurb: { en: "10 mixed questions from every pattern.", th: "10 ข้อคละจากทุกรูปแบบ" }, color: 3 },
  // Short sessions, shown at the top of the Practice hub. All sentences are one thought group in 2-3-1.
  {
    id: "session",
    title: { en: "Session: 5 draw + 2 speak", th: "เซสชัน: วาด 5 + พูด 2" },
    badge: "7",
    blurb: { en: "Five 2-3-1 drawings, then two 2-3-1 sentences aloud.", th: "วาด 2-3-1 ห้าข้อ แล้วพูดประโยค 2-3-1 สองข้อ" },
    color: 1,
    session: true,
  },
  {
    id: "draw3a",
    title: { en: "Draw 3 · Set A", th: "วาด 3 ข้อ · ชุด A" },
    badge: "3",
    blurb: { en: "The same three 2-3-1 drawings every time.", th: "วาด 2-3-1 สามข้อเดิมทุกครั้ง" },
    color: 1,
    session: true,
  },
  {
    id: "draw3b",
    title: { en: "Draw 3 · Set B", th: "วาด 3 ข้อ · ชุด B" },
    badge: "3",
    blurb: { en: "The same three 2-3-1 drawings every time.", th: "วาด 2-3-1 สามข้อเดิมทุกครั้ง" },
    color: 1,
    session: true,
  },
  {
    id: "speak3",
    title: { en: "Speak 3 · assessment", th: "พูด 3 ข้อ · ประเมิน" },
    badge: "3",
    blurb: { en: "A speaking check: say the same three 2-3-1 sentences.", th: "ตรวจการพูด: พูดประโยค 2-3-1 สามข้อเดิมทุกครั้ง" },
    color: 2,
    session: true,
  },
];

/** The Practice course that drills a mastery pattern ("2-3" -> rising), or null for a pattern with none. */
export function courseForPattern(pattern: string): CourseId | null {
  return { "2-3-1": "falling", "2-3": "rising", "2-3-2": "nonfinal", "3-1": "tags" }[pattern] as CourseId | undefined ?? null;
}

export function courseById(id: string): PracticeCourse | undefined {
  return COURSES.find((c) => c.id === id);
}

const isTag = (s: Sentence) => s.kind.startsWith("Tag question");

/** One thought group in 2-3-1: a statement, wh-question, command or exclamation. */
const isFalling = (s: Sentence) => s.groups.length === 1 && s.groups[0].pattern === "2-3-1";

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
 *  - session / draw3a / draw3b / speak3: one-group 2-3-1 sentences (the three sessions after `session` are fixed,
 *    see FIXED_SENTENCES)
 */
export function courseSentences(id: CourseId, all: readonly Sentence[]): Sentence[] {
  const fixed = FIXED_SENTENCES[id];
  if (fixed) {
    // resolved in the fixed order; an id that no longer exists is simply skipped (tests catch it)
    const byId = new Map(all.map((s) => [s.id, s]));
    return fixed.map((sid) => byId.get(sid)).filter((s): s is Sentence => s !== undefined);
  }
  switch (id) {
    case "falling":
    case "session":
    case "draw3a":
    case "draw3b":
    case "speak3":
      return all.filter(isFalling);
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

/** The exercise types a short plan may use (the ones that need nothing but a sentence). */
export type PlanType = "peak" | "build" | "draw" | "shadow";

/** The mixed session: five drawings first, then two sentences said aloud. */
export const SESSION_PLAN: readonly PlanType[] = ["draw", "draw", "draw", "draw", "draw", "shadow", "shadow"];

/** A short drawing-only session. */
export const DRAW3_PLAN: readonly PlanType[] = ["draw", "draw", "draw"];

/** The speaking assessment session: three sentences said aloud, one after another. */
export const SPEAK3_PLAN: readonly PlanType[] = ["shadow", "shadow", "shadow"];

/** Sessions with their own plan. Every other course uses DRILL_PLAN. */
export const PLAN_BY_COURSE: Readonly<Partial<Record<CourseId, readonly PlanType[]>>> = {
  session: SESSION_PLAN,
  draw3a: DRAW3_PLAN,
  draw3b: DRAW3_PLAN,
  speak3: SPEAK3_PLAN,
};

/**
 * Sessions whose sentences never change, so a learner can repeat exactly the same run (or compare two attempts).
 * Everything else is shuffled per seed.
 */
export const FIXED_SENTENCES: Readonly<Partial<Record<CourseId, readonly string[]>>> = {
  // The six session sentences live in their own pack (content/source/practice/session-sets.json).
  draw3a: ["session-a-home", "session-a-book", "session-a-door"],
  draw3b: ["session-b-teacher", "session-b-driver", "session-b-from"],
  // Three kinds of 2-3-1 for a speaking check: a statement, a wh-question and an exclamation.
  speak3: ["falling-1-drink-tea", "falling-2-how-are-you", "falling-3-beautiful-day"],
};

/** The exercise order a course runs: its own session plan, else the standard 10-question drill. */
export function planFor(course: CourseId): readonly PlanType[] {
  return PLAN_BY_COURSE[course] ?? DRILL_PLAN;
}

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
  // a fixed session keeps its authored order; everything else is shuffled by the seed
  const order = FIXED_SENTENCES[course] ? pool : seededShuffle(pool, hashSeed(`${course}:${seed}`));
  const used: Sentence[] = [];
  const exercises = planFor(course).map((type, i): Exercise => {
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
    // a session card counts its own exercises (7, 3); a pattern drill counts the sentences it draws from
    size: PLAN_BY_COURSE[course]?.length ?? courseSentences(course, all).length,
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

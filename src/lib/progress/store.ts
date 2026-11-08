// Local (browser) progress: XP, streak and finished lessons. Pure functions + a tiny localStorage wrapper.
// This is the CONTRACT between the lesson player (writes via `completeLesson`) and the home path (reads).
// Phase 1 task C5 later mirrors this to Supabase; keep these function signatures stable.
// Owner: the lesson-player session. The home-path session only reads it.

export interface LessonResult {
  stars: number; // 0–3
  best: number; // best score 0–100
  completedAt: string; // ISO time
}

export interface Progress {
  xp: number;
  /** Consecutive days with at least one finished lesson. */
  streak: number;
  /** Local calendar day of the last finished lesson, "YYYY-MM-DD". */
  lastDay: string | null;
  lessons: Record<string, LessonResult>;
}

export const STORAGE_KEY = "myna.progress.v1";

export function emptyProgress(): Progress {
  return { xp: 0, streak: 0, lastDay: null, lessons: {} };
}

export function starsFor(score: number): number {
  return score >= 90 ? 3 : score >= 75 ? 2 : score >= 55 ? 1 : 0;
}

/** Local calendar day as "YYYY-MM-DD". */
export function dayKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function previousDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d - 1));
}

/** Record a finished lesson: adds XP, updates the streak and keeps the best score. Pure: returns a new object. */
export function completeLesson(
  p: Progress,
  lessonId: string,
  result: { score: number; xp: number },
  now: Date = new Date(),
): Progress {
  const today = dayKey(now);
  const streak = p.lastDay === today ? p.streak : p.lastDay === previousDay(today) ? p.streak + 1 : 1;
  const prev = p.lessons[lessonId];
  const best = Math.max(prev?.best ?? 0, result.score);
  return {
    xp: p.xp + Math.max(0, Math.round(result.xp)),
    streak,
    lastDay: today,
    lessons: { ...p.lessons, [lessonId]: { stars: Math.max(prev?.stars ?? 0, starsFor(result.score)), best, completedAt: now.toISOString() } },
  };
}

/** The streak as it should be shown today: a streak whose last day was before yesterday has lapsed. */
export function visibleStreak(p: Progress, now: Date = new Date()): number {
  const today = dayKey(now);
  return p.lastDay === today || p.lastDay === previousDay(today) ? p.streak : 0;
}

type Store = Pick<Storage, "getItem" | "setItem">;

export function loadProgress(storage?: Store): Progress {
  try {
    const s = storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
    const raw = s?.getItem(STORAGE_KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw) as Partial<Progress>;
    return { ...emptyProgress(), ...parsed, lessons: { ...(parsed.lessons ?? {}) } };
  } catch {
    return emptyProgress(); // private mode, blocked storage or corrupt JSON: start fresh
  }
}

export function saveProgress(p: Progress, storage?: Store): void {
  try {
    const s = storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
    s?.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // storage unavailable: progress simply isn't remembered
  }
}

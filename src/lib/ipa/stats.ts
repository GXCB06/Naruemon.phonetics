// IPA practice results for My Progress: per-symbol accuracy and the learner's usual mix-ups (θ → t, z → s, ɪ → i).
// Pure: no DOM, no React, no clock. The same fold runs over this device's results and over the server's rows.

import type { Bilingual } from "../intonation/types.ts";
import { alignSymbols, STRESS, type IpaGrade } from "./practice.ts";

export type IpaMode = "build" | "write";

/** One checked word: a row of `ipa_attempts` (migration 0003), minus `id`, `user_id` and `client_id`. */
export interface IpaAttemptRow {
  word: string;
  mode: IpaMode;
  grade: IpaGrade;
  /** The answer, one symbol per tile (with ˈ). */
  answer: string[];
  /** What the learner placed, one symbol per tile. */
  got: string[];
  /** ISO time of CHECK. */
  created_at: string;
}

export interface SymbolCount {
  /** How often the symbol was in a checked answer. */
  n: number;
  /** How often the learner got it wrong there (another symbol, or left out). */
  wrong: number;
}

export interface IpaStats {
  /** Checked words (a word practised twice counts twice). */
  attempts: number;
  grades: Record<IpaGrade, number>;
  /** word → times checked. */
  words: Record<string, number>;
  /** symbol → counts. The stress mark is not a sound, so it is not here (a missing ˈ is what "Good" means). */
  symbols: Record<string, SymbolCount>;
  /** "want>got" → times; got is "" when the learner left the sound out. */
  confusions: Record<string, number>;
}

/** Marks a left-out sound in `confusions`. */
export const MISSING = "";

export function emptyIpaStats(): IpaStats {
  return { attempts: 0, grades: { perfect: 0, good: 0, miss: 0 }, words: {}, symbols: {}, confusions: {} };
}

export function confusionKey(want: string, got: string): string {
  return `${want}>${got}`;
}

export function parseConfusionKey(key: string): { want: string; got: string } | null {
  const i = key.indexOf(">");
  if (i <= 0) return null;
  return { want: key.slice(0, i), got: key.slice(i + 1) };
}

/**
 * What one answer says about each sound in the word: per answer symbol (not the stress mark), right or wrong, and for
 * a wrong one what the learner wrote instead (MISSING when it was left out, null when it was replaced by a stress mark).
 */
export function symbolOutcomes(answer: readonly string[], got: readonly string[]): { want: string; ok: boolean; got: string | null }[] {
  const out: { want: string; ok: boolean; got: string | null }[] = [];
  const wrong: { want: string; got: string | null }[] = [];
  for (const op of alignSymbols(answer, got).ops) {
    if (op.type === "sub" && op.want && op.want !== STRESS) wrong.push({ want: op.want, got: op.got === STRESS ? null : (op.got ?? null) });
    else if (op.type === "missing" && op.want && op.want !== STRESS) wrong.push({ want: op.want, got: MISSING });
  }
  // Every answer symbol appears in at most one op, so wrong ones are taken off its count.
  const left = new Map<string, { want: string; got: string | null }[]>();
  for (const w of wrong) left.set(w.want, [...(left.get(w.want) ?? []), w]);
  for (const s of answer) {
    if (s === STRESS) continue;
    const pending = left.get(s);
    const w = pending?.shift();
    out.push(w ? { want: s, ok: false, got: w.got } : { want: s, ok: true, got: s });
  }
  return out;
}

function isRow(x: unknown): x is IpaAttemptRow {
  const r = x as IpaAttemptRow | null;
  return (
    !!r &&
    typeof r.word === "string" &&
    (r.grade === "perfect" || r.grade === "good" || r.grade === "miss") &&
    Array.isArray(r.answer) &&
    Array.isArray(r.got) &&
    r.answer.every((s) => typeof s === "string") &&
    r.got.every((s) => typeof s === "string")
  );
}

/** Add one checked word. Returns new stats; malformed rows are ignored. */
export function addIpaAttempt(stats: IpaStats, row: IpaAttemptRow): IpaStats {
  if (!isRow(row)) return stats;
  const symbols = { ...stats.symbols };
  const confusions = { ...stats.confusions };
  for (const o of symbolOutcomes(row.answer, row.got)) {
    const prev = symbols[o.want] ?? { n: 0, wrong: 0 };
    symbols[o.want] = { n: prev.n + 1, wrong: prev.wrong + (o.ok ? 0 : 1) };
    if (!o.ok && o.got !== null) {
      const key = confusionKey(o.want, o.got);
      confusions[key] = (confusions[key] ?? 0) + 1;
    }
  }
  return {
    attempts: stats.attempts + 1,
    grades: { ...stats.grades, [row.grade]: stats.grades[row.grade] + 1 },
    words: { ...stats.words, [row.word]: (stats.words[row.word] ?? 0) + 1 },
    symbols,
    confusions,
  };
}

export function ipaStatsFromRows(rows: readonly unknown[]): IpaStats {
  let s = emptyIpaStats();
  for (const r of rows) if (isRow(r)) s = addIpaAttempt(s, r);
  return s;
}

/** The side resting on more checked words (ties: local). The server keeps a recent window, this device a running total. */
export function mergeIpaStats(local: IpaStats, remote: IpaStats | null | undefined): IpaStats {
  return remote && remote.attempts > local.attempts ? remote : local;
}

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;

/** Parse stored JSON; anything malformed falls back to empty stats (or drops the bad entry). */
export function parseIpaStats(raw: string | null | undefined): IpaStats {
  if (!raw) return emptyIpaStats();
  try {
    const p = JSON.parse(raw) as Partial<IpaStats> | null;
    if (!p || typeof p !== "object" || !isCount(p.attempts)) return emptyIpaStats();
    const out = emptyIpaStats();
    out.attempts = p.attempts;
    for (const g of ["perfect", "good", "miss"] as const) if (isCount(p.grades?.[g])) out.grades[g] = p.grades[g];
    for (const [w, n] of Object.entries(p.words ?? {})) if (isCount(n)) out.words[w] = n;
    for (const [s, c] of Object.entries(p.symbols ?? {})) if (c && isCount(c.n) && isCount(c.wrong)) out.symbols[s] = { n: c.n, wrong: c.wrong };
    for (const [k, n] of Object.entries(p.confusions ?? {})) if (parseConfusionKey(k) && isCount(n)) out.confusions[k] = n;
    return out;
  } catch {
    return emptyIpaStats();
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The weakest sounds

/** A sound needs this many checks before it can be called weak. */
export const MIN_SYMBOL_SEEN = 2;

export interface WeakSymbol {
  symbol: string;
  n: number;
  wrong: number;
  /** 0–100. */
  accuracy: number;
  /** The learner's most common mix-up for this sound, or null (only stress-mark slips). */
  mixUp: { got: string; count: number } | null;
}

/** The most common thing written instead of `symbol` (ties: the first seen). */
export function topMixUp(stats: IpaStats, symbol: string): { got: string; count: number } | null {
  let best: { got: string; count: number } | null = null;
  for (const [key, count] of Object.entries(stats.confusions)) {
    const k = parseConfusionKey(key);
    if (!k || k.want !== symbol || count <= 0) continue;
    if (!best || count > best.count) best = { got: k.got, count };
  }
  return best;
}

/**
 * Up to `n` sounds the learner gets wrong most (lowest accuracy, then most mistakes), among sounds checked at least
 * MIN_SYMBOL_SEEN times with at least one mistake.
 */
export function weakestSymbols(stats: IpaStats, n = 5, minSeen = MIN_SYMBOL_SEEN): WeakSymbol[] {
  return Object.entries(stats.symbols)
    .filter(([, c]) => c.n >= minSeen && c.wrong > 0)
    .map(([symbol, c]) => ({
      symbol,
      n: c.n,
      wrong: c.wrong,
      accuracy: Math.round(((c.n - c.wrong) / c.n) * 100),
      mixUp: topMixUp(stats, symbol),
    }))
    .sort((a, b) => a.accuracy - b.accuracy || b.wrong - a.wrong || a.symbol.localeCompare(b.symbol))
    .slice(0, Math.max(0, n));
}

/** "You often write t for θ" / "You often leave out r" / "You got θ right 3 of 5 times". */
export function mixUpSentence(w: WeakSymbol): Bilingual {
  if (w.mixUp && w.mixUp.got === MISSING) {
    return { en: `You often leave out ${w.symbol}`, th: `คุณมักลืมใส่เสียง ${w.symbol}` };
  }
  if (w.mixUp) {
    return { en: `You often write ${w.mixUp.got} for ${w.symbol}`, th: `คุณมักเขียน ${w.mixUp.got} แทน ${w.symbol}` };
  }
  const right = w.n - w.wrong;
  return { en: `You got ${w.symbol} right ${right} of ${w.n} times`, th: `คุณเขียน ${w.symbol} ถูก ${right} จาก ${w.n} ครั้ง` };
}

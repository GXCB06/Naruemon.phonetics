// IPA practice results: a local running total for My Progress and a queue for Supabase (`ipa_attempts`, migration 0003).
// Same shape as the lesson attempts (queue.ts + flush.ts) but separate, so a project that has not run 0003 yet never
// holds up lesson attempts. Never throws. No audio and no handwriting image is ever stored: only symbols.
//
//  - myna.ipaStats.v1: running IPA stats on this device (works with no Supabase at all)
//  - myna.ipaAttempts.v1: checked words not yet written to Supabase (capped, oldest dropped first)

import { addIpaAttempt, emptyIpaStats, parseIpaStats, type IpaAttemptRow, type IpaStats } from "../ipa/stats.ts";
import { newAttemptId } from "./queue.ts";

export const IPA_QUEUE_KEY = "myna.ipaAttempts.v1";
export const IPA_STATS_KEY = "myna.ipaStats.v1";
export const MAX_IPA_QUEUE = 300;

export interface QueuedIpaAttempt {
  /** Sent as `client_id`, so a retried flush never inserts the same word twice. */
  id: string;
  row: IpaAttemptRow;
}

export interface IpaRemoteDb {
  userId(): Promise<string | null>;
  /** Insert unless this user already has a row with this `client_id`. True when inserted, false for a retry. Throws on failure. */
  insertIpaAttempt(userId: string, item: QueuedIpaAttempt): Promise<boolean>;
}

type Store = Pick<Storage, "getItem" | "setItem">;

function defaultStore(): Store | undefined {
  try {
    return typeof localStorage !== "undefined" ? localStorage : undefined;
  } catch {
    return undefined;
  }
}

function isQueued(x: unknown): x is QueuedIpaAttempt {
  const q = x as QueuedIpaAttempt | null;
  return !!q && typeof q.id === "string" && !!q.row && typeof q.row.word === "string" && Array.isArray(q.row.got);
}

export function loadIpaQueue(storage?: Store): QueuedIpaAttempt[] {
  try {
    const raw = (storage ?? defaultStore())?.getItem(IPA_QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isQueued) : [];
  } catch {
    return [];
  }
}

export function saveIpaQueue(queue: readonly QueuedIpaAttempt[], storage?: Store): void {
  try {
    (storage ?? defaultStore())?.setItem(IPA_QUEUE_KEY, JSON.stringify(queue.slice(-MAX_IPA_QUEUE)));
  } catch {
    // storage full or unavailable
  }
}

export function loadIpaStats(storage?: Store): IpaStats {
  try {
    return parseIpaStats((storage ?? defaultStore())?.getItem(IPA_STATS_KEY));
  } catch {
    return emptyIpaStats();
  }
}

export function saveIpaStats(stats: IpaStats, storage?: Store): void {
  try {
    (storage ?? defaultStore())?.setItem(IPA_STATS_KEY, JSON.stringify(stats));
  } catch {
    // ignore
  }
}

/** Build the row for one checked word. Pure. */
export function buildIpaAttempt(
  input: { word: string; mode: IpaAttemptRow["mode"]; grade: IpaAttemptRow["grade"]; answer: readonly string[]; got: readonly string[] },
  now: Date = new Date(),
): IpaAttemptRow {
  return {
    word: input.word,
    mode: input.mode,
    grade: input.grade,
    answer: [...input.answer],
    got: [...input.got],
    created_at: now.toISOString(),
  };
}

/** Add the word to this device's stats and to the upload queue. Never throws. */
export function storeIpaAttempt(row: IpaAttemptRow, storage?: Store): void {
  try {
    saveIpaStats(addIpaAttempt(loadIpaStats(storage), row), storage);
    saveIpaQueue([...loadIpaQueue(storage), { id: newAttemptId(), row }], storage);
  } catch {
    // never break the practice
  }
}

/** Send queued words, oldest first; stop at the first failure and keep the rest. Never throws. Returns how many left the queue. */
export async function flushIpaQueue(db: IpaRemoteDb, storage?: Store): Promise<number> {
  let sent = 0;
  try {
    const userId = await db.userId();
    if (!userId) return 0;
    for (const item of loadIpaQueue(storage)) {
      await db.insertIpaAttempt(userId, item);
      saveIpaQueue(loadIpaQueue(storage).filter((q) => q.id !== item.id), storage);
      sent += 1;
    }
  } catch {
    // offline, table missing (0003 not run), signed out mid-way: keep the rest queued
  }
  return sent;
}

// Write queued attempts to the database. The database is behind a tiny interface (`RemoteDb`) so this logic is pure
// and testable with a fake; src/lib/attempts/supabase.ts is the real implementation.

import { applyResults, skillKey, type MasteryMap } from "../mastery/mastery.ts";
import { loadQueue, removeFromQueue, saveQueue, type QueuedAttempt } from "./queue.ts";

export interface RemoteDb {
  /** The signed-in user's id, or null when nobody is signed in. */
  userId(): Promise<string | null>;
  /**
   * Insert the attempt unless this user already has one with the same `client_id`.
   * Resolves true when a row was inserted, false when it already existed (a retry). Throws on failure.
   */
  insertAttempt(userId: string, item: QueuedAttempt): Promise<boolean>;
  /** The user's stored mastery for these patterns. */
  loadMastery(userId: string, patterns: string[]): Promise<MasteryMap>;
  /** Insert or update these mastery entries (keys as in `skillKey`). */
  upsertMastery(userId: string, entries: MasteryMap): Promise<void>;
}

type Store = Parameters<typeof loadQueue>[0];

/**
 * Send every queued attempt, oldest first, and take it off the queue once it is stored. Mastery is only updated for an
 * attempt that was really inserted, so a retried flush never counts an attempt twice. Stops at the first failure and
 * keeps that attempt (and the ones after it) for next time. Never throws. Returns how many attempts left the queue.
 */
export async function flushQueue(db: RemoteDb, storage?: Store): Promise<number> {
  let sent = 0;
  try {
    const userId = await db.userId();
    if (!userId) return 0;
    for (const item of loadQueue(storage)) {
      const inserted = await db.insertAttempt(userId, item);
      if (inserted) {
        try {
          const patterns = [...new Set(item.skills.map((s) => s.pattern))];
          const stored = await db.loadMastery(userId, patterns);
          const next = applyResults(stored, item.skills, item.row.created_at);
          const changed: MasteryMap = {};
          for (const s of item.skills) {
            const key = skillKey(s.pattern, s.skill, s.modality);
            if (next[key] && next[key] !== stored[key]) changed[key] = next[key];
          }
          if (Object.keys(changed).length > 0) await db.upsertMastery(userId, changed);
        } catch {
          // The attempt itself is stored (and must not be inserted again); only this mastery update is lost.
        }
      }
      saveQueue(removeFromQueue(loadQueue(storage), item.id), storage);
      sent += 1;
    }
  } catch {
    // offline, signed out mid-way, RLS error...: keep the rest queued
  }
  return sent;
}

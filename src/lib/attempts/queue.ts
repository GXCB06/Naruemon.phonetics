// Local storage for attempts and mastery. A tiny wrapper like src/lib/progress/store.ts: it never throws.
//
//  - myna.attempts.v1: attempts not yet written to Supabase (capped, oldest dropped first)
//  - myna.mastery.v1: the learner's skill mastery on this device (works with no Supabase at all)

import type { MasteryMap, SkillResult } from "../mastery/mastery.ts";
import type { AttemptRow } from "./build.ts";

export const QUEUE_KEY = "myna.attempts.v1";
export const MASTERY_KEY = "myna.mastery.v1";
export const MAX_QUEUE = 200;

export interface QueuedAttempt {
  /** Random id made on the device; sent as `client_id` so a retried flush can never insert the same attempt twice. */
  id: string;
  row: AttemptRow;
  skills: SkillResult[];
}

type Store = Pick<Storage, "getItem" | "setItem">;

function defaultStore(): Store | undefined {
  try {
    return typeof localStorage !== "undefined" ? localStorage : undefined;
  } catch {
    return undefined; // access can throw when site data is blocked
  }
}

function isQueued(x: unknown): x is QueuedAttempt {
  const q = x as QueuedAttempt | null;
  return !!q && typeof q.id === "string" && !!q.row && typeof q.row.sentence_id === "string" && Array.isArray(q.skills);
}

export function loadQueue(storage?: Store): QueuedAttempt[] {
  try {
    const raw = (storage ?? defaultStore())?.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isQueued) : [];
  } catch {
    return [];
  }
}

export function saveQueue(queue: readonly QueuedAttempt[], storage?: Store): void {
  try {
    (storage ?? defaultStore())?.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
  } catch {
    // storage full or unavailable: the attempt is simply not remembered
  }
}

/** Append, keeping at most `max` (the oldest are dropped). Pure. */
export function enqueue(queue: readonly QueuedAttempt[], item: QueuedAttempt, max: number = MAX_QUEUE): QueuedAttempt[] {
  return [...queue, item].slice(-Math.max(1, max));
}

export function removeFromQueue(queue: readonly QueuedAttempt[], id: string): QueuedAttempt[] {
  return queue.filter((q) => q.id !== id);
}

export function loadMastery(storage?: Store): MasteryMap {
  try {
    const raw = (storage ?? defaultStore())?.getItem(MASTERY_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: MasteryMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, MasteryMap[string]>)) {
      if (v && typeof v.score === "number" && typeof v.attemptsN === "number") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveMastery(mastery: MasteryMap, storage?: Store): void {
  try {
    (storage ?? defaultStore())?.setItem(MASTERY_KEY, JSON.stringify(mastery));
  } catch {
    // ignore
  }
}

/** A device-local random id (UUID v4 shape, as Postgres `uuid` expects). */
export function newAttemptId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // fall through
  }
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(3)}-${hex(12)}`;
}

// What the server knows about the signed-in learner, for the My Progress screen. Everything here is optional:
// with no Supabase, or signed out, or offline, it resolves to null and the screen simply uses this device's data.

import { supabaseRemote } from "@/lib/attempts/supabase.ts";
import { ipaStatsFromRows, type IpaStats } from "@/lib/ipa/stats.ts";
import type { MasteryMap } from "@/lib/mastery/mastery.ts";
import { tallyFromRows, type GradeTally } from "@/lib/progress/grades.ts";
import { PATTERN_ORDER, type AttemptPoint } from "@/lib/progress/view.ts";
import { createClient } from "@/lib/supabase/client.ts";
import { isSupabaseConfigured } from "@/lib/supabase/env.ts";

export interface RemoteProgress {
  mastery: MasteryMap;
  /** Recent graded attempts. Attempts already flushed leave the local queue, so the server is where the trend lives. */
  points: AttemptPoint[];
  /** Draw it grades per pattern from the server's draw rows (null before migration 0003 or on error). */
  drawGrades: GradeTally | null;
  /** IPA practice stats from `ipa_attempts` (null before migration 0003 or on error). */
  ipa: IpaStats | null;
}

const TIMEOUT_MS = 6000;
const RECENT_ATTEMPTS = 300;
/** Enough rows for running totals; past this the device's own running total usually wins the merge anyway. */
const RECENT_GRADED = 1000;

interface AttemptDbRow {
  client_id: string | null;
  pattern: string;
  modality: string;
  overall: number;
  created_at: string;
}

async function fetchRemote(): Promise<RemoteProgress | null> {
  if (!isSupabaseConfigured()) return null;
  const client = createClient();
  if (!client) return null;
  const db = supabaseRemote(client);
  const userId = await db.userId();
  if (!userId) return null;

  // skill_mastery goes through the shared helper; a failure here means no server data at all.
  const mastery = await db.loadMastery(userId, [...PATTERN_ORDER]);

  // The attempts list only feeds the trend: if it fails, the mastery still shows.
  let points: AttemptPoint[] = [];
  try {
    const { data, error } = await client
      .from("attempts")
      .select("client_id, pattern, modality, overall, created_at")
      .order("created_at", { ascending: false })
      .limit(RECENT_ATTEMPTS);
    if (!error) {
      points = ((data ?? []) as AttemptDbRow[]).map((r, i) => ({
        // same id as the local queue item (client_id), so a not-yet-removed local copy is not counted twice
        id: r.client_id ?? `server-${r.created_at}-${i}`,
        at: r.created_at,
        pattern: r.pattern,
        modality: r.modality,
        overall: r.overall,
      }));
    }
  } catch {
    // trend falls back to this device
  }
  // Draw grades and IPA results are separate reads, so a project without migration 0003 still gets mastery and trend.
  let drawGrades: GradeTally | null = null;
  try {
    const { data, error } = await client
      .from("attempts")
      .select("pattern, modality, draw_grade")
      .eq("modality", "draw")
      .not("draw_grade", "is", null)
      .order("created_at", { ascending: false })
      .limit(RECENT_GRADED);
    if (!error) drawGrades = tallyFromRows((data ?? []) as { pattern: string; modality: string; draw_grade: unknown }[]);
  } catch {
    // device tally only
  }

  let ipa: IpaStats | null = null;
  try {
    const { data, error } = await client
      .from("ipa_attempts")
      .select("word, mode, grade, answer, got, created_at")
      .order("created_at", { ascending: false })
      .limit(RECENT_GRADED);
    if (!error) ipa = ipaStatsFromRows((data ?? []) as unknown[]);
  } catch {
    // device stats only
  }

  return { mastery, points, drawGrades, ipa };
}

/** Never throws; null when there is nothing to merge in. Gives up after a few seconds so the screen never hangs. */
export async function loadRemoteProgress(): Promise<RemoteProgress | null> {
  try {
    return await Promise.race([
      fetchRemote(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);
  } catch {
    return null;
  }
}

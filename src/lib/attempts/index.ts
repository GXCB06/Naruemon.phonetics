// Saving attempts (SPEC C5) and skill mastery (D2) from the lesson player.
//
// `saveAttempt` never blocks and never throws into the UI. Every attempt is first written to a capped local queue
// (myna.attempts.v1) and to the device's mastery (myna.mastery.v1); then, if Supabase is configured and the learner is
// signed in, the queue is flushed to the database in the background. With no Supabase, or signed out, the queue just
// waits (and is flushed after sign-in). No audio is ever stored.

import type { AnalysisResult, Sentence } from "../intonation/types.ts";
import { applyResults, type SkillResult } from "../mastery/mastery.ts";
import { buildAttempt, buildListenAttempt, skillsFromRow, type AttemptRow, type DrawGrade } from "./build.ts";
import { recordDrawGrade } from "../progress/grades.ts";
import { buildIpaAttempt, flushIpaQueue, storeIpaAttempt } from "./ipa.ts";
import { flushQueue } from "./flush.ts";
import { enqueue, loadMastery, loadQueue, newAttemptId, saveMastery, saveQueue } from "./queue.ts";
import { isSupabaseConfigured } from "../supabase/env.ts";
import { createClient } from "../supabase/client.ts";
import { supabaseRemote } from "./supabase.ts";

export { buildAttempt, buildAttemptRow, buildListenAttempt, skillsFromRow, type AttemptRow, type DrawGrade } from "./build.ts";
export { flushQueue, type RemoteDb } from "./flush.ts";
export { loadMastery, loadQueue, MASTERY_KEY, MAX_QUEUE, QUEUE_KEY } from "./queue.ts";
export { IPA_QUEUE_KEY, IPA_STATS_KEY, loadIpaQueue, loadIpaStats } from "./ipa.ts";

let flushing: Promise<void> | null = null;
let flushAgain = false;
let watching = false;

/** Flush the local queue to Supabase if it is configured and a user is signed in. One flush at a time; never throws. */
export function flushAttemptQueue(): Promise<void> {
  if (flushing) {
    flushAgain = true; // something was queued while a flush ran: go round again afterwards
    return flushing;
  }
  flushing = (async () => {
    try {
      if (typeof window === "undefined" || !isSupabaseConfigured()) return;
      const client = createClient();
      if (!client) return;
      watchSignIn(client);
      do {
        flushAgain = false;
        const remote = supabaseRemote(client);
        await flushQueue(remote);
        await flushIpaQueue(remote); // its own queue: a missing ipa_attempts table never holds up lesson attempts
      } while (flushAgain);
    } catch {
      // never surface storage/network problems to the lesson
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

/** Once per page: when the learner signs in, flush what was queued while signed out. */
function watchSignIn(client: NonNullable<ReturnType<typeof createClient>>) {
  if (watching) return;
  watching = true;
  client.auth.onAuthStateChange((event) => {
    // Not awaited and deferred: supabase-js must not be called synchronously from inside this callback.
    if (event === "SIGNED_IN") setTimeout(() => void flushAttemptQueue(), 0);
  });
}

/**
 * Remember one attempt. `skills` default to the row's checks (all counted toward the row's pattern); pass the ones from
 * `buildAttempt` so each thought group counts toward its own pattern.
 */
export function saveAttempt(row: AttemptRow, skills: SkillResult[] = skillsFromRow(row)): void {
  try {
    saveMastery(applyResults(loadMastery(), skills, row.created_at));
    if (row.draw_grade) recordDrawGrade(row.pattern, row.draw_grade);
    saveQueue(enqueue(loadQueue(), { id: newAttemptId(), row, skills }));
    void flushAttemptQueue();
  } catch {
    // an attempt that cannot be saved must never break the lesson
  }
}

/**
 * The lesson player's one call after CHECK: a drawing or recording (with its analysis) becomes a draw/speak attempt;
 * Hear it and Find the peak (no analysis) become a "listening" attempt.
 */
export function recordExerciseAttempt(
  sentence: Sentence,
  type: "hear" | "peak" | "draw" | "shadow",
  result: { passed: boolean; analysis?: AnalysisResult; grade?: DrawGrade },
): void {
  try {
    const built =
      (type === "draw" || type === "shadow") && result.analysis
        ? type === "draw"
          ? buildAttempt(sentence, result.analysis, "draw", new Date(), result.grade)
          : buildAttempt(sentence, result.analysis, "speak")
        : type === "hear" || type === "peak"
          ? buildListenAttempt(sentence, result.passed)
          : null;
    if (built) saveAttempt(built.row, built.skills);
  } catch {
    // never break the lesson
  }
}

/**
 * IPA practice's one call after CHECK: the word, how it was answered (build/write), the grade, the answer and the
 * learner's symbols. Updates this device's IPA stats (My Progress) and queues the row for Supabase. Never throws.
 */
export function recordIpaAttempt(input: Parameters<typeof buildIpaAttempt>[0]): void {
  try {
    storeIpaAttempt(buildIpaAttempt(input));
    void flushAttemptQueue();
  } catch {
    // never break the practice
  }
}

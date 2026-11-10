"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { IPA_STATS_KEY, MASTERY_KEY, QUEUE_KEY, loadIpaStats, loadMastery, loadQueue } from "@/lib/attempts/index.ts";
import { mergeIpaStats } from "@/lib/ipa/stats.ts";
import { DRAW_GRADES_KEY, loadGradeTally, mergeGradeTallies } from "@/lib/progress/grades.ts";
import { hasEnoughData, type MasteryMap } from "@/lib/mastery/mastery.ts";
import {
  buildDrawGradeRows,
  buildHeatMap,
  buildIpaProgress,
  buildInsights,
  dailyTrend,
  firstVsLatest,
  mergeAttemptPoints,
  mergeMastery,
  pointsFromQueue,
  topImprovements,
} from "@/lib/progress/view.ts";
import { loadRemoteProgress, type RemoteProgress } from "./remote";

// Local storage is read only after hydration (the server and the first client render see "nothing yet"), then the
// signed-in learner's server rows are merged in when they arrive. With no Supabase the remote step just resolves to null.

const SEP = "\u0000";
const KEYS = [MASTERY_KEY, QUEUE_KEY, DRAW_GRADES_KEY, IPA_STATS_KEY] as const;

function getRaw(): string {
  try {
    return KEYS.map((k) => localStorage.getItem(k) ?? "").join(SEP);
  } catch {
    return SEP.repeat(KEYS.length - 1);
  }
}

function subscribe(cb: () => void) {
  // "storage": another tab saved an attempt. "focus"/"pageshow": coming back from a lesson in this tab.
  window.addEventListener("storage", cb);
  window.addEventListener("focus", cb);
  window.addEventListener("pageshow", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("focus", cb);
    window.removeEventListener("pageshow", cb);
  };
}

// The clock is read once on the client (never while prerendering, which cacheComponents forbids) and then reused.
let clientNow: Date | null = null;
function getNow(): Date | null {
  clientNow ??= new Date();
  return clientNow;
}

const noop = () => () => {};

export function useProgressData() {
  const raw = useSyncExternalStore(subscribe, getRaw, () => "");
  const now = useSyncExternalStore(noop, getNow, () => null);
  // undefined = still asking the server, null = nothing to merge (signed out, no Supabase, offline)
  const [remote, setRemote] = useState<RemoteProgress | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void loadRemoteProgress().then((r) => {
      if (!cancelled) setRemote(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const local = useMemo(() => {
    const parts = raw.split(SEP);
    const store = { getItem: (k: string) => parts[KEYS.indexOf(k as (typeof KEYS)[number])] || null, setItem: () => {} };
    return { mastery: loadMastery(store), queue: loadQueue(store), grades: loadGradeTally(store), ipa: loadIpaStats(store) };
  }, [raw]);

  return useMemo(() => {
    if (!now) return null; // not hydrated yet
    const mastery: MasteryMap = remote ? mergeMastery(local.mastery, remote.mastery) : local.mastery;
    const points = mergeAttemptPoints(pointsFromQueue(local.queue), remote?.points ?? []);
    const heat = buildHeatMap(mastery);
    const drawGrades = buildDrawGradeRows(remote?.drawGrades ? mergeGradeTallies(local.grades, remote.drawGrades) : local.grades);
    const ipa = buildIpaProgress(mergeIpaStats(local.ipa, remote?.ipa));
    return {
      settled: remote !== undefined,
      isEmpty: heat.length === 0 && points.length === 0 && drawGrades.length === 0 && ipa === null,
      heat,
      hasEnoughSomewhere: Object.values(mastery).some((e) => hasEnoughData(e.attemptsN)),
      improvements: topImprovements(mastery, 3),
      insights: buildInsights(mastery),
      trend: dailyTrend(points, now, 14),
      firstLatest: firstVsLatest(points),
      drawGrades,
      ipa,
    };
  }, [now, local, remote]);
}

export type ProgressData = NonNullable<ReturnType<typeof useProgressData>>;

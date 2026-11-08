"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { MASTERY_KEY, QUEUE_KEY, loadMastery, loadQueue } from "@/lib/attempts/index.ts";
import { hasEnoughData, type MasteryMap } from "@/lib/mastery/mastery.ts";
import {
  buildHeatMap,
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

function getRaw(): string {
  try {
    return `${localStorage.getItem(MASTERY_KEY) ?? ""}${SEP}${localStorage.getItem(QUEUE_KEY) ?? ""}`;
  } catch {
    return SEP;
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
    const [m, q] = raw.split(SEP);
    const store = { getItem: (k: string) => (k === MASTERY_KEY ? m || null : q || null), setItem: () => {} };
    return { mastery: loadMastery(store), queue: loadQueue(store) };
  }, [raw]);

  return useMemo(() => {
    if (!now) return null; // not hydrated yet
    const mastery: MasteryMap = remote ? mergeMastery(local.mastery, remote.mastery) : local.mastery;
    const points = mergeAttemptPoints(pointsFromQueue(local.queue), remote?.points ?? []);
    const heat = buildHeatMap(mastery);
    return {
      settled: remote !== undefined,
      isEmpty: heat.length === 0 && points.length === 0,
      heat,
      hasEnoughSomewhere: Object.values(mastery).some((e) => hasEnoughData(e.attemptsN)),
      improvements: topImprovements(mastery, 3),
      insights: buildInsights(mastery),
      trend: dailyTrend(points, now, 14),
      firstLatest: firstVsLatest(points),
    };
  }, [now, local, remote]);
}

export type ProgressData = NonNullable<ReturnType<typeof useProgressData>>;

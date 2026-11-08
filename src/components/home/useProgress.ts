"use client";

import { useMemo, useSyncExternalStore } from "react";
import { STORAGE_KEY, emptyProgress, loadProgress, visibleStreak } from "@/lib/progress/store.ts";
import type { Progress } from "@/lib/progress/store.ts";

// Reads the learner's local progress without touching localStorage during render: the server (and the first
// client render) see "no progress", then the real value arrives right after hydration. The snapshot is the raw
// string so it is cheap to compare; parsing goes through the store's own `loadProgress`.

function getRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function subscribe(cb: () => void) {
  // "storage": another tab finished a lesson. "focus"/"pageshow": coming back from a lesson in this tab.
  window.addEventListener("storage", cb);
  window.addEventListener("focus", cb);
  window.addEventListener("pageshow", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("focus", cb);
    window.removeEventListener("pageshow", cb);
  };
}

export function useProgress(): { progress: Progress; streak: number } {
  const raw = useSyncExternalStore(subscribe, getRaw, () => null);
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const progress = useMemo(() => (raw === null ? emptyProgress() : loadProgress({ getItem: () => raw, setItem: () => {} })), [raw]);
  // visibleStreak reads the clock, which must not happen while prerendering (cacheComponents): wait for the client.
  return { progress, streak: ready ? visibleStreak(progress) : 0 };
}

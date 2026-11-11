"use client";

import { useSyncExternalStore } from "react";

// The 🐢 Slow setting, remembered on this device and shared by every screen that plays a clip.

const KEY = "myna.slow";
const listeners = new Set<() => void>();
let current: boolean | null = null; // in-memory copy so it still works when storage is blocked

export function getSlow(): boolean {
  if (current === null) {
    try {
      current = localStorage.getItem(KEY) === "on";
    } catch {
      current = false;
    }
  }
  return current;
}

export function setSlow(on: boolean): void {
  current = on;
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // applies for this visit only
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSlow(): boolean {
  return useSyncExternalStore(subscribe, getSlow, () => false);
}

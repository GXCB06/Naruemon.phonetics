"use client";

import { useSyncExternalStore } from "react";

// What the practice clips of "Hear it" and "Match" sound like: a real spoken voice (default) or the plain melody, a synthetic
// voice that carries only the tune. The melody is easier to identify, the voice is what you will hear in real life.
// Remembered on this device and shared by every screen that plays such a clip.

const KEY = "myna.melody";
const listeners = new Set<() => void>();
let current: boolean | null = null; // in-memory copy so it still works when storage is blocked

/** true = melody only; false = real voice where a recording exists. */
export function getMelody(): boolean {
  if (current === null) {
    try {
      current = localStorage.getItem(KEY) === "on";
    } catch {
      current = false;
    }
  }
  return current;
}

export function setMelody(on: boolean): void {
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

export function useMelody(): boolean {
  return useSyncExternalStore(subscribe, getMelody, () => false);
}

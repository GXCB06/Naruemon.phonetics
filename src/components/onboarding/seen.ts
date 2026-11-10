"use client";

import { useSyncExternalStore } from "react";

// "Has this learner seen the How-Myna-works intro?" Remembered in localStorage (per device), like the UI language.
// The server snapshot says "seen", so returning learners never get a flash of the intro; a fresh visitor sees the
// home path for one frame after hydration, then the intro.

const KEY = "myna.onboarded.v1";
const listeners = new Set<() => void>();
let current: boolean | null = null; // in-memory copy so "skip" still works when storage is blocked

function readStored(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return true; // storage blocked (private mode): don't nag on every visit
  }
}

function getSnapshot(): boolean {
  return current ?? readStored();
}

function getServerSnapshot(): boolean {
  return true;
}

function notify() {
  listeners.forEach((l) => l());
}

function onStorage(e: StorageEvent) {
  if (e.key === KEY || e.key === null) {
    current = null;
    notify();
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

export function markOnboarded() {
  current = true;
  try {
    localStorage.setItem(KEY, new Date().toISOString());
  } catch {
    // not remembered, but it still applies for this visit
  }
  notify();
}

export function useOnboarded(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

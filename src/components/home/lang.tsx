"use client";

import { useSyncExternalStore } from "react";
import type { Bilingual } from "@/lib/course/units.ts";

// UI language: the chosen language is the big line, the other one sits under it in small muted text,
// so every label stays bilingual (same idea as the lab). Default is Thai first.

export type Lang = "th" | "en";

const KEY = "myna.lang.v1";
const listeners = new Set<() => void>();
let current: Lang | null = null; // in-memory copy so the toggle still works when storage is blocked

function readStored(): Lang {
  try {
    return localStorage.getItem(KEY) === "en" ? "en" : "th";
  } catch {
    return "th";
  }
}

function getSnapshot(): Lang {
  return current ?? readStored();
}

function getServerSnapshot(): Lang {
  return "th";
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

export function setLang(lang: Lang) {
  current = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // not remembered, but it still applies for this visit
  }
  notify();
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Plain string in the chosen language (for aria-labels). */
export function useText(): (b: Bilingual) => string {
  const lang = useLang();
  return (b) => b[lang];
}

/** Two stacked lines: chosen language first, the other smaller underneath. */
export function Bi({
  text,
  className = "",
  subClassName = "",
  inline = false,
}: {
  text: Bilingual;
  className?: string;
  subClassName?: string;
  inline?: boolean;
}) {
  const lang = useLang();
  const other: Lang = lang === "th" ? "en" : "th";
  return (
    <span className={`${inline ? "inline-flex" : "flex"} flex-col ${className}`}>
      <span lang={lang} className={lang === "th" ? "thai" : ""}>
        {text[lang]}
      </span>
      <span lang={other} className={`${other === "th" ? "thai" : ""} text-[0.78em] font-semibold leading-tight text-muted ${subClassName}`}>
        {text[other]}
      </span>
    </span>
  );
}

export function LangToggle() {
  const lang = useLang();
  const options: { value: Lang; label: string; name: string }[] = [
    { value: "en", label: "EN", name: "English" },
    { value: "th", label: "TH", name: "ภาษาไทย" },
  ];
  return (
    <div role="group" aria-label="Language · ภาษา" className="flex rounded-xl border-2 border-line bg-card p-0.5">
      {options.map((o) => {
        const on = lang === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            aria-label={o.name}
            onClick={() => setLang(o.value)}
            className={`min-h-9 min-w-10 rounded-[0.6rem] px-2 text-sm font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              on ? "bg-accent text-bg" : "text-muted hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

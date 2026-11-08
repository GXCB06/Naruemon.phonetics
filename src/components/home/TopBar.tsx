"use client";

import type { Progress } from "@/lib/progress/store.ts";
import { BoltIcon, FlameIcon, MynaMark } from "./icons";
import { LangToggle, useLang } from "./lang";

export function TopBar({ progress, streak }: { progress: Progress; streak: number }) {
  const lang = useLang();
  const streakLabel = lang === "th" ? `สตรีค ${streak} วัน` : `${streak}-day streak`;
  const xpLabel = `${progress.xp} XP`;

  return (
    <header className="sticky top-0 z-20 border-b-2 border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-md items-center gap-2 px-4 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <MynaMark className="size-8 shrink-0" />
          <span className="text-xl font-black tracking-tight">Myna</span>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <div
            role="status"
            aria-label={streakLabel}
            className={`flex min-h-9 items-center gap-1 rounded-xl border-2 px-2 text-sm font-extrabold ${
              streak > 0 ? "border-warn bg-warn-soft text-ink" : "border-line bg-card text-muted"
            }`}
          >
            <FlameIcon className={`size-5 ${streak > 0 ? "" : "opacity-40 grayscale"}`} />
            <span aria-hidden>{streak}</span>
          </div>
          <div
            role="status"
            aria-label={xpLabel}
            className="flex min-h-9 items-center gap-1 rounded-xl border-2 border-line bg-card px-2 text-sm font-extrabold"
          >
            <BoltIcon className="size-5" />
            <span aria-hidden>{progress.xp}</span>
          </div>
          <LangToggle />
        </div>
      </div>
    </header>
  );
}

"use client";

import { useMemo } from "react";
import { karaokeTimeline, wordState, type KaraokeTimeline } from "@/lib/intonation/karaoke";
import type { Sentence } from "@/lib/intonation/types";

export { karaokeTimeline } from "@/lib/intonation/karaoke";

/**
 * Teleprompter-style sentence: words light up at a natural pace while the learner speaks.
 * The nucleus word of each thought group grows and turns yellow with ↗, followed by the expected ending arrow.
 * `elapsedSec` is seconds since "Go"; pass `null` before the take starts (everything stays dim).
 * With prefers-reduced-motion the nucleus only changes colour (no scaling).
 */
export function KaraokeSentence({
  sentence,
  elapsedSec,
  timeline,
}: {
  sentence: Sentence;
  elapsedSec: number | null;
  timeline?: KaraokeTimeline;
}) {
  const tl = useMemo(() => timeline ?? karaokeTimeline(sentence), [sentence, timeline]);
  const t = elapsedSec ?? -1;

  return (
    <div role="group" aria-label={sentence.text} className="flex flex-wrap items-start gap-x-2 gap-y-3 sm:gap-x-3">
      {tl.words.map((w, i) => {
        const state = wordState(w, t);
        const group = tl.groups[w.groupIndex];
        const startsNewGroup = w.wordIndex === 0 && w.groupIndex > 0;
        const reached = state !== "upcoming";
        const nucleusOn = w.isNucleus && reached;

        const base =
          "inline-flex items-center gap-1 rounded-xl px-1.5 py-0.5 text-3xl font-black leading-tight sm:text-4xl motion-safe:transition-[transform,color,background-color] motion-safe:duration-200";
        const tone = nucleusOn
          ? "bg-primary text-primary-ink motion-safe:scale-110"
          : state === "active"
            ? "text-ink underline decoration-accent decoration-4 underline-offset-4"
            : state === "done"
              ? "text-ink"
              : "text-muted opacity-60";

        return (
          <span key={i} className={`inline-flex items-start gap-1.5 ${startsNewGroup ? "ml-2 border-l-2 border-line pl-3 sm:ml-3" : ""}`}>
            <span
              className={`${base} ${tone} ${nucleusOn ? "mx-1" : ""}`}
              aria-current={state === "active" ? "true" : undefined}
              data-state={state}
              data-nucleus={w.isNucleus ? "true" : undefined}
            >
              {w.text}
              {w.isNucleus && (
                <span aria-hidden="true" className={`text-2xl sm:text-3xl ${nucleusOn ? "" : "invisible"}`}>
                  ↗
                </span>
              )}
            </span>
            {w.isNucleus && (
              <span
                className={`flex flex-col items-center rounded-lg bg-accent-soft px-1.5 py-0.5 leading-tight text-accent ${nucleusOn ? "" : "invisible"}`}
                title={`${group.ending.caption.en} / ${group.ending.caption.th}`}
              >
                <span aria-hidden="true" className="text-2xl font-black sm:text-3xl">
                  {group.ending.arrow}
                </span>
                <span className="text-[0.7rem] font-bold">{group.ending.caption.en}</span>
                <span className="thai text-[0.7rem] font-bold">{group.ending.caption.th}</span>
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

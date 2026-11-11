"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Bi, useLang } from "@/components/home/lang";
import { StarIcon } from "@/components/home/icons";
import { unitColor } from "@/components/home/PathMap";
import { useProgress } from "@/components/home/useProgress";
import { allSentences } from "@/lib/learn/content";
import { speakKey, topicById, topicSentences } from "@/lib/speak/topics";

/** The sentences of one Speak topic, with the best score of each. Tap one to speak it. */
export function TopicList({ topicId }: { topicId: string }) {
  const topic = topicById(topicId);
  const { progress } = useProgress();
  const lang = useLang();
  const sentences = useMemo(() => (topic ? topicSentences(topic, allSentences()) : []), [topic]);
  if (!topic) return null;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 pb-6 pt-3" style={unitColor(topic.color)}>
      <header className="flex items-center gap-3">
        <Link href="/lab" aria-label="Back · กลับ" className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-line hover:text-ink">
          <svg viewBox="0 0 24 24" className="size-7" aria-hidden fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <div className="unit-banner min-w-0 flex-1 rounded-2xl px-4 py-3">
          <p className="ipa text-xs font-black uppercase tracking-wider text-white/80">{topic.badge}</p>
          <h1 className="text-xl font-black leading-tight">
            <Bi text={topic.title} subClassName="text-white/80!" />
          </h1>
        </div>
      </header>

      <p className="text-sm font-semibold text-muted">
        <Bi text={topic.blurb} subClassName="hidden" />
      </p>

      <ul className="flex flex-col gap-3">
        {sentences.map((s) => {
          const r = Object.hasOwn(progress.lessons, speakKey(s.id)) ? progress.lessons[speakKey(s.id)] : null;
          return (
            <li key={s.id}>
              <Link
                href={`/lab/${topic.id}/${s.id}`}
                className="group flex items-center gap-3 rounded-2xl border-2 border-b-4 border-line bg-card p-4 transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:border-b-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-bold leading-snug">{s.text}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold text-muted">
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 font-extrabold text-accent">{[...new Set(s.groups.map((g) => g.pattern))].join(" | ")}</span>
                    {r ? (
                      <span className="flex items-center gap-1 font-extrabold text-ink">
                        <span className="flex gap-0.5 text-[var(--u2)]" aria-label={`${r.stars} / 3`}>
                          {[1, 2, 3].map((n) => (
                            <StarIcon key={n} filled={n <= r.stars} className="size-3.5" />
                          ))}
                        </span>
                        {Math.round(r.best)}%
                      </span>
                    ) : (
                      <span>{lang === "th" ? "ยังไม่ได้พูด" : "Not spoken yet"}</span>
                    )}
                  </span>
                </span>
                <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--u)] text-white">
                  <svg viewBox="0 0 24 24" className="size-6" fill="currentColor">
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

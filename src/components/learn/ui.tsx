"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MynaBot, type BotMood } from "@/components/mascot/MynaBot";
import { Bi, useLang } from "@/components/home/lang";
import type { Bilingual, Sentence } from "@/lib/intonation/types";
import type { ClipVariant } from "@/lib/learn/exercises";
import { playReference, stopReference, type ReferenceSource } from "./playReference";

/** The one-line instruction at the top of every exercise: chosen language big, the other small underneath. */
export function Prompt({ title, tip }: { title: Bilingual; tip?: Bilingual }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-[1.6rem] font-black leading-tight sm:text-3xl">
        <Bi text={title} subClassName="mt-1 text-[0.62em]" />
      </h1>
      {tip && (
        <div>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1 rounded-full border-2 border-line px-3 py-1 text-sm font-extrabold text-muted hover:text-ink"
          >
            <span aria-hidden>💡</span>
            <Bi text={{ en: open ? "Hide tip" : "Tip", th: open ? "ซ่อนคำใบ้" : "คำใบ้" }} inline className="flex-row! items-baseline gap-1.5" />
          </button>
          {open && (
            <p className="pop-in mt-2 rounded-2xl bg-accent-soft p-3 text-sm font-semibold text-ink">
              <Bi text={tip} />
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Myna with a speech bubble: the sentence (or a short scene) the exercise is about. */
export function MynaSays({ children, mood = "idle" }: { children: ReactNode; mood?: BotMood }) {
  return (
    <div className="flex items-start gap-4">
      <MynaBot mood={mood} className="size-16 shrink-0 sm:size-20" />
      <div className="bubble min-w-0 flex-1 p-3 sm:p-4">{children}</div>
    </div>
  );
}

export function SpeakerIcon({ className = "", on = false }: { className?: string; on?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
      <path d="M15.5 9a4 4 0 0 1 0 6" className={on ? "opacity-100" : "opacity-70"} />
      <path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" className={on ? "opacity-100" : "opacity-40"} />
    </svg>
  );
}

/** Play one clip; resolves when it starts. Errors are swallowed (sound is never required to answer). */
export function useClip() {
  const [playing, setPlaying] = useState<string | null>(null);
  const [source, setSource] = useState<ReferenceSource | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopReference();
    };
  }, []);
  const play = async (
    key: string,
    sentence: Sentence,
    opts: { variant?: ClipVariant; forceSynth?: boolean; fairWith?: readonly string[]; realVariants?: readonly ClipVariant[] } = {},
  ) => {
    setPlaying(key);
    try {
      const p = await playReference(sentence, opts);
      if (!alive.current) return;
      setSource(p.source);
      await p.ended;
    } catch {
      // no audio on this device
    } finally {
      if (alive.current) setPlaying((k) => (k === key ? null : k));
    }
  };
  return { play, playing, source };
}

/** The big round speaker button (plays the sentence's textbook clip). */
export function SpeakerButton({
  sentence,
  fairWith,
  size = "lg",
  onPlay,
}: {
  sentence: Sentence;
  fairWith?: readonly string[];
  size?: "lg" | "md";
  onPlay?: () => void;
}) {
  const { play, playing } = useClip();
  const lang = useLang();
  const dim = size === "lg" ? "size-16 sm:size-20" : "size-12";
  return (
    <button
      type="button"
      aria-label={lang === "th" ? `ฟัง: ${sentence.text}` : `Listen: ${sentence.text}`}
      onClick={() => {
        onPlay?.();
        void play("main", sentence, { fairWith });
      }}
      className={`btn btn-accent shrink-0 rounded-2xl p-0! ${dim}`}
    >
      <SpeakerIcon className={size === "lg" ? "size-9 sm:size-11" : "size-7"} on={playing !== null} />
    </button>
  );
}

/** Number keys pick answers on a keyboard (1, 2, 3 ...), like the on-screen badges say. */
export function useNumberKeys(count: number, onKey: (index: number) => void, enabled: boolean) {
  const cb = useRef(onKey);
  useEffect(() => {
    cb.current = onKey;
  });
  useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= count) {
        e.preventDefault();
        cb.current(n - 1);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [count, enabled]);
}

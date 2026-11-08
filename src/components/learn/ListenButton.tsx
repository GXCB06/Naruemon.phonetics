"use client";

import { useEffect, useRef, useState } from "react";
import type { Sentence } from "@/lib/intonation/types";
import type { ClipVariant } from "@/lib/learn/exercises";
import { playReference, stopReference, type ReferenceSource } from "./playReference";

/** Small badge: the voice you hear is a synthetic stand-in until the real reference recordings exist. */
export function PlaceholderBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-warn-soft px-2 py-0.5 text-xs font-extrabold text-warn">
      Placeholder voice
      <span className="thai ml-1 font-semibold">เสียงตัวอย่างชั่วคราว</span>
    </span>
  );
}

/**
 * Plays a sentence (reference mp3 if it exists, otherwise the placeholder voice) and says which one it was.
 * `onPlay` fires when playback starts, so a parent can unlock things that need the learner to have listened first.
 */
export function ListenButton({
  sentence,
  variant = "falling",
  forceSynth = false,
  label,
  ariaLabel,
  className = "btn btn-accent",
  onPlay,
}: {
  sentence: Sentence;
  variant?: ClipVariant;
  forceSynth?: boolean;
  label?: { en: string; th: string };
  /** Accessible name; defaults to "Listen: <sentence>". Give each clip of a pair its own. */
  ariaLabel?: string;
  className?: string;
  onPlay?: (source: ReferenceSource) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [source, setSource] = useState<ReferenceSource | null>(null);
  const [error, setError] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopReference();
    };
  }, []);

  const play = async () => {
    setError(false);
    setPlaying(true);
    try {
      const p = await playReference(sentence, { variant, forceSynth });
      if (!alive.current) return;
      setSource(p.source);
      onPlay?.(p.source);
      await p.ended;
    } catch {
      if (alive.current) setError(true);
    } finally {
      if (alive.current) setPlaying(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button type="button" className={className} onClick={() => void play()} aria-label={ariaLabel ?? `Listen: ${sentence.text}`}>
        <span aria-hidden>{playing ? "🔊" : "▶"}</span>
        {label ? (
          <span>
            {label.en} <span className="thai text-sm font-semibold">{label.th}</span>
          </span>
        ) : (
          <span>
            Listen <span className="thai text-sm font-semibold">ฟัง</span>
          </span>
        )}
      </button>
      {source === "placeholder" && <PlaceholderBadge />}
      {error && (
        <span className="text-sm font-semibold text-bad">
          Couldn&apos;t play audio on this device.
          <span className="thai block font-normal">เล่นเสียงบนอุปกรณ์นี้ไม่ได้</span>
        </span>
      )}
    </div>
  );
}

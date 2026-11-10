"use client";

import { useEffect, useRef, useState } from "react";
import type { Sentence } from "@/lib/intonation/types";
import type { ClipVariant } from "@/lib/learn/exercises";
import type { ReferenceVoice } from "@/lib/learn/reference";
import { playReference, prefetchReference, setPreferredVoice, stopReference, type ReferenceSource } from "./playReference";

/**
 * Small badge for the synthetic voice. "placeholder": no real recording of this sentence yet. "practice": the clips are
 * synthetic on purpose (a "Hear it" pair), so both sound the same and only the tune differs.
 */
export function PlaceholderBadge({ kind = "placeholder" }: { kind?: "placeholder" | "practice" }) {
  return (
    <span className="inline-flex items-center rounded-full bg-warn-soft px-2 py-0.5 text-xs font-extrabold text-warn">
      {kind === "practice" ? (
        <>
          Practice voice: only the tune changes
          <span className="thai ml-1 font-semibold">เสียงฝึก: ต่างกันแค่ทำนอง</span>
        </>
      ) : (
        <>
          Placeholder voice
          <span className="thai ml-1 font-semibold">เสียงตัวอย่างชั่วคราว</span>
        </>
      )}
    </span>
  );
}

const VOICE_NAME: Record<ReferenceVoice, { en: string; th: string }> = {
  f: { en: "female voice", th: "เสียงผู้หญิง" },
  m: { en: "male voice", th: "เสียงผู้ชาย" },
};

/**
 * Plays a sentence (the real reference clip if there is one, otherwise the placeholder voice) and says which one it was.
 * After a real clip, a small button plays the other voice and remembers it as the learner's choice.
 * `onPlay` fires when playback starts, so a parent can unlock things that need the learner to have listened first.
 */
export function ListenButton({
  sentence,
  variant,
  forceSynth = false,
  fairWith,
  label,
  ariaLabel,
  className = "btn btn-accent",
  onPlay,
}: {
  sentence: Sentence;
  /** Which clip to play; omit for the sentence's textbook tune. */
  variant?: ClipVariant;
  forceSynth?: boolean;
  /** Sentence ids that must have a real clip in the same voice, else the placeholder plays (see pickReferenceVoice). */
  fairWith?: readonly string[];
  label?: { en: string; th: string };
  /** Accessible name; defaults to "Listen: <sentence>". Give each clip of a pair its own. */
  ariaLabel?: string;
  className?: string;
  onPlay?: (source: ReferenceSource) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [source, setSource] = useState<ReferenceSource | null>(null);
  const [other, setOther] = useState<ReferenceVoice | null>(null);
  const [error, setError] = useState(false);
  const alive = useRef(true);
  const fairKey = fairWith?.join(",") ?? "";
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopReference();
    };
  }, []);
  useEffect(() => {
    if (!forceSynth && variant === undefined) void prefetchReference(sentence, fairKey ? fairKey.split(",") : []);
  }, [sentence, forceSynth, variant, fairKey]);

  const play = async (pick?: ReferenceVoice) => {
    setError(false);
    setPlaying(true);
    try {
      const p = await playReference(sentence, { variant, forceSynth, fairWith, voice: pick });
      if (!alive.current) return;
      setSource(p.source);
      setOther(p.alternative);
      if (pick && p.voice === pick) setPreferredVoice(pick);
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
      {source === "placeholder" && <PlaceholderBadge kind={forceSynth ? "practice" : "placeholder"} />}
      {source === "file" && other && (
        <button
          type="button"
          className="text-xs font-bold text-accent underline underline-offset-2"
          onClick={() => void play(other)}
          aria-label={`Play the ${VOICE_NAME[other].en}`}
        >
          Hear the {VOICE_NAME[other].en} <span className="thai font-semibold">ฟัง{VOICE_NAME[other].th}</span>
        </button>
      )}
      {error && (
        <span className="text-sm font-semibold text-bad">
          Couldn&apos;t play audio on this device.
          <span className="thai block font-normal">เล่นเสียงบนอุปกรณ์นี้ไม่ได้</span>
        </span>
      )}
    </div>
  );
}

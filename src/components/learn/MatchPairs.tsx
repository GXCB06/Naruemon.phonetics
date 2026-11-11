"use client";

import { useEffect, useState } from "react";
import { Bi } from "@/components/home/lang";
import type { Sentence } from "@/lib/intonation/types";
import type { ClipVariant, MatchExercise } from "@/lib/learn/exercises";
import { MATCH_LABEL, matchFeedback, matchScore } from "@/lib/learn/match";
import { graded } from "@/lib/learn/score";
import { playNoPair, playPair } from "./chime";
import { PlaceholderBadge } from "./ListenButton";
import { prefetchVariants } from "./playReference";
import { ClipSoundToggle, Prompt, SlowToggle, SpeakerIcon, useClip } from "./ui";
import type { ExerciseApi } from "./types";

type Side = { side: "clip" | "label"; index: number };

/**
 * Match the pairs: three clips of the same sentence on the left (tap to hear), what they do on the right. Pick one from
 * each side; a right pair locks in, a wrong pair shakes. CHECK opens once every pair is found; wrong tries lower the score.
 */
export function MatchPairs({
  exercise,
  sentence,
  locked,
  api,
}: {
  exercise: MatchExercise;
  sentence: Sentence;
  locked: boolean;
  api: ExerciseApi;
}) {
  const [sel, setSel] = useState<Side | null>(null);
  const [found, setFound] = useState<ClipVariant[]>([]);
  const [wrong, setWrong] = useState<Side[] | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const { play, playing, source } = useClip();
  const { setCheck } = api;
  const complete = found.length === exercise.clips.length;
  useEffect(() => {
    void prefetchVariants(sentence, exercise.clips);
  }, [sentence, exercise.clips]);

  useEffect(() => {
    if (!complete) return setCheck(null);
    setCheck(() => {
      const { score, passed } = matchScore(mistakes);
      return { outcome: graded(exercise.id, "match", score, passed), feedback: matchFeedback(mistakes) };
    });
  }, [complete, mistakes, exercise.id, setCheck]);

  const variantOf = (s: Side) => (s.side === "clip" ? exercise.clips[s.index] : exercise.labels[s.index]);

  const tap = (s: Side) => {
    if (s.side === "clip") void play(`m${s.index}`, sentence, { variant: exercise.clips[s.index], forceSynth: true, realVariants: exercise.clips });
    if (locked || found.includes(variantOf(s))) return;
    setWrong(null);
    if (!sel || sel.side === s.side) {
      setSel(sel && sel.side === s.side && sel.index === s.index ? null : s);
      return;
    }
    if (variantOf(sel) === variantOf(s)) {
      playPair(found.length);
      setFound((f) => [...f, variantOf(s)]);
    } else {
      playNoPair();
      setMistakes((m) => m + 1);
      setWrong([sel, s]);
    }
    setSel(null);
  };

  const stateOf = (s: Side) => {
    if (found.includes(variantOf(s))) return "is-done";
    if (wrong?.some((w) => w.side === s.side && w.index === s.index)) return "is-wrong shake";
    if (sel && sel.side === s.side && sel.index === s.index) return "is-on";
    return "";
  };

  return (
    <div className="flex flex-col gap-6">
      <Prompt
        title={{ en: "Tap the matching pairs", th: "จับคู่ให้ตรงกัน" }}
        tip={{
          en: "Tap a speaker to hear the clip, then tap what it does. All three say the same sentence; only the end of the tune changes.",
          th: "แตะลำโพงเพื่อฟัง แล้วแตะคำอธิบายที่ตรงกัน ทั้งสามเสียงพูดประโยคเดียวกัน ต่างกันแค่ตอนจบของทำนอง",
        }}
      />
      <p className="text-lg font-bold leading-snug text-muted">“{sentence.text}”</p>

      <div className="-mb-2 flex flex-wrap items-center justify-between gap-2">
        <ClipSoundToggle />
        <SlowToggle />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="flex flex-col gap-3" role="group" aria-label="Clips" data-sfx="none">
          {exercise.clips.map((v, i) => {
            const s: Side = { side: "clip", index: i };
            const done = found.includes(v);
            return (
              <button
                key={`c${i}`}
                type="button"
                aria-pressed={sel?.side === "clip" && sel.index === i}
                aria-label={`Clip ${i + 1}${done ? " (matched)" : ""}`}
                onClick={() => tap(s)}
                className={`pick flex min-h-16 items-center justify-center gap-2 px-3 py-3 ${stateOf(s)}`}
              >
                <span className="key-hint max-sm:hidden" aria-hidden>
                  {i + 1}
                </span>
                <SpeakerIcon className="size-8" on={playing === `m${i}`} />
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-3" role="group" aria-label="What the clip does">
          {exercise.labels.map((v, i) => {
            const s: Side = { side: "label", index: i };
            const info = MATCH_LABEL[v];
            return (
              <button
                key={`l${i}`}
                type="button"
                disabled={locked}
                aria-pressed={sel?.side === "label" && sel.index === i}
                onClick={() => tap(s)}
                className={`pick flex min-h-16 items-center gap-2 px-3 py-2 text-left ${stateOf(s)}`}
              >
                <span className="text-2xl font-black" aria-hidden>
                  {info?.arrow}
                </span>
                {info && <Bi text={info.label} className="min-w-0 font-extrabold leading-tight" />}
              </button>
            );
          })}
        </div>
      </div>
      {complete && !locked && (
        <p className="pop-in text-center font-bold text-good" role="status">
          <Bi text={{ en: "All matched! Tap CHECK.", th: "จับคู่ครบแล้ว! กด CHECK" }} className="items-center" />
        </p>
      )}
      {source === "placeholder" && <PlaceholderBadge kind="practice" />}
    </div>
  );
}

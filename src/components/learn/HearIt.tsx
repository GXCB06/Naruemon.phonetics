"use client";

import { useEffect, useState } from "react";
import type { Sentence } from "@/lib/intonation/types";
import type { ClipVariant, HearExercise } from "@/lib/learn/exercises";
import { hearFeedback } from "@/lib/learn/feedback";
import { rightWrong } from "@/lib/learn/score";
import { ListenButton, PlaceholderBadge } from "./ListenButton";
import type { ExerciseApi } from "./types";

const NAMES = ["A", "B"] as const;

/** Hear it: two clips of the same sentence, pick the one with the falling (2-3-1) tune. */
export function HearIt({
  exercise,
  sentence,
  locked,
  api,
  notice,
}: {
  exercise: HearExercise;
  sentence: Sentence;
  locked: boolean;
  api: ExerciseApi;
  /** Shown above the question, e.g. when this replaced "Shadow it" because there is no microphone. */
  notice?: { en: string; th: string };
}) {
  const [picked, setPicked] = useState<0 | 1 | null>(null);
  const { setCheck } = api;

  useEffect(() => {
    if (picked === null) return setCheck(null);
    setCheck(() => {
      const right = picked === exercise.correct;
      const wrong = exercise.clips[exercise.correct === 0 ? 1 : 0] as Exclude<ClipVariant, "falling">;
      return { outcome: rightWrong(exercise.id, "hear", right), feedback: hearFeedback(right, wrong) };
    });
  }, [picked, exercise, setCheck]);

  return (
    <div className="flex flex-col gap-5">
      {notice && (
        <p className="rounded-xl bg-accent-soft p-3 text-sm font-bold text-accent" role="status">
          {notice.en}
          <span className="thai block font-semibold">{notice.th}</span>
        </p>
      )}
      <div>
        <h1 className="text-2xl font-black leading-snug">
          Which one is the falling tune?
          <span className="thai block text-lg font-bold text-muted">อันไหนคือเสียงตก?</span>
        </h1>
        <p className="mt-3 text-xl font-bold">“{sentence.text}”</p>
        <p className="mt-1 text-sm text-muted">
          A falling sentence goes up to one peak, then ends low (2-3-1).
          <span className="thai block">เสียงตกจะขึ้นสูงที่จุดเดียวแล้วจบด้วยเสียงต่ำ (2-3-1)</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Pick the falling clip">
        {([0, 1] as const).map((i) => {
          const isPicked = picked === i;
          const isRight = i === exercise.correct;
          const tone =
            locked && isRight
              ? "border-good bg-good-soft"
              : locked && isPicked
                ? "border-bad bg-bad-soft"
                : isPicked
                  ? "border-primary-deep bg-primary/20"
                  : "border-line bg-card";
          return (
            <div key={i} className={`flex flex-col items-center gap-3 rounded-2xl border-2 p-3 ${tone}`}>
              <div className="text-3xl font-black" aria-hidden>
                {NAMES[i]}
              </div>
              <ListenButton
                sentence={sentence}
                variant={exercise.clips[i]}
                forceSynth
                label={{ en: `Clip ${NAMES[i]}`, th: `เสียง ${NAMES[i]}` }}
                ariaLabel={`Play clip ${NAMES[i]}`}
                className="btn w-full"
              />
              <button
                type="button"
                role="radio"
                aria-checked={isPicked}
                aria-label={`Clip ${NAMES[i]} is the falling tune`}
                disabled={locked}
                onClick={() => setPicked(i)}
                className={`btn w-full flex-col gap-0 leading-tight ${isPicked ? "btn-primary" : ""}`}
              >
                <span>{isPicked ? "✓ " : ""}This one</span>
                <span className="thai text-sm font-semibold">อันนี้</span>
              </button>
            </div>
          );
        })}
      </div>
      <PlaceholderBadge />
    </div>
  );
}

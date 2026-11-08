"use client";

import { useEffect, useState } from "react";
import type { Sentence } from "@/lib/intonation/types";
import { peakFeedback } from "@/lib/learn/feedback";
import type { PeakExercise } from "@/lib/learn/exercises";
import { rightWrong } from "@/lib/learn/score";
import { ListenButton } from "./ListenButton";
import type { ExerciseApi } from "./types";

interface Pick {
  word: number;
  syllable: number;
}

/** Find the peak: tap the syllable where the voice goes highest (stressed syllable of the last content word). */
export function FindPeak({
  exercise,
  sentence,
  locked,
  api,
}: {
  exercise: PeakExercise;
  sentence: Sentence;
  locked: boolean;
  api: ExerciseApi;
}) {
  const group = sentence.groups[0];
  const [picked, setPicked] = useState<Pick | null>(null);
  const { setCheck } = api;

  useEffect(() => {
    if (!picked) return setCheck(null);
    setCheck(() => {
      const right = picked.word === group.nucleus.word && picked.syllable === group.nucleus.syllable;
      return { outcome: rightWrong(exercise.id, "peak", right), feedback: peakFeedback(right, sentence) };
    });
  }, [picked, group, exercise.id, sentence, setCheck]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-black leading-snug">
          Tap the peak
          <span className="thai block text-lg font-bold text-muted">แตะพยางค์ที่เสียงสูงที่สุด</span>
        </h1>
        <p className="mt-1 text-sm text-muted">
          Listen, then tap the syllable where the voice goes highest.
          <span className="thai block">ฟังแล้วแตะพยางค์ที่เสียงขึ้นสูงสุด</span>
        </p>
      </div>

      <ListenButton sentence={sentence} />

      <div className="card flex flex-wrap items-end gap-x-3 gap-y-5 p-4" role="group" aria-label="Syllables">
        {group.words.map((w, wi) => (
          <div key={wi} className="flex flex-col items-center gap-1">
            <div className="flex">
              {w.syllables.map((s, si) => {
                const isPicked = picked?.word === wi && picked.syllable === si;
                const isRight = group.nucleus.word === wi && group.nucleus.syllable === si;
                const tone =
                  locked && isRight
                    ? "bg-good text-white"
                    : locked && isPicked
                      ? "bg-bad text-white"
                      : isPicked
                        ? "bg-primary text-primary-ink"
                        : "bg-bg text-ink hover:bg-accent-soft";
                return (
                  <button
                    key={si}
                    type="button"
                    disabled={locked}
                    aria-pressed={isPicked}
                    onClick={() => setPicked({ word: wi, syllable: si })}
                    className={`min-h-11 min-w-9 rounded-lg border-2 border-line px-1.5 text-xl font-bold sm:text-2xl ${tone} ${
                      w.syllables.length > 1 && si > 0 ? "-ml-0.5" : ""
                    }`}
                  >
                    {s.text}
                    {si === w.syllables.length - 1 ? w.text.replace(/^.*?([^A-Za-z']*)$/, "$1") : ""}
                  </button>
                );
              })}
            </div>
            {/* no stress marks here: they would give the answer away */}
            <span className="ipa text-sm text-muted">/{w.syllables.map((s) => s.ipa).join(".")}/</span>
          </div>
        ))}
      </div>
    </div>
  );
}

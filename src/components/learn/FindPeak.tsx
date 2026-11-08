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

/**
 * Find the peak: tap the stressed syllable of the last content word. A falling sentence peaks there; a rising one starts
 * its rise there and stays up. With several thought groups the learner taps one syllable per group (in any order).
 */
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
  const groups = sentence.groups;
  const many = groups.length > 1;
  const rising = groups.every((g) => g.pattern === "2-3");
  const [picks, setPicks] = useState<(Pick | null)[]>(() => groups.map(() => null));
  const { setCheck } = api;

  useEffect(() => {
    if (picks.some((p) => p === null)) return setCheck(null);
    setCheck(() => {
      const right = groups.every((g, gi) => picks[gi]?.word === g.nucleus.word && picks[gi]?.syllable === g.nucleus.syllable);
      return { outcome: rightWrong(exercise.id, "peak", right), feedback: peakFeedback(right, sentence) };
    });
  }, [picks, groups, exercise.id, sentence, setCheck]);

  const remaining = picks.filter((p) => p === null).length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-black leading-snug">
          {many ? (
            <>
              Tap each peak
              <span className="thai block text-lg font-bold text-muted">แตะจุดสูงสุดของแต่ละกลุ่มคำ</span>
            </>
          ) : rising ? (
            <>
              Tap where the rise starts
              <span className="thai block text-lg font-bold text-muted">แตะพยางค์ที่เสียงเริ่มขึ้นสูง</span>
            </>
          ) : (
            <>
              Tap the peak
              <span className="thai block text-lg font-bold text-muted">แตะพยางค์ที่เสียงสูงที่สุด</span>
            </>
          )}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {many ? (
            <>
              There are {groups.length} thought groups, split by |. Listen, then tap one syllable in each: where the voice
              {rising ? " jumps up and stays up." : " goes highest."}
              <span className="thai block">
                มี {groups.length} กลุ่มคำ คั่นด้วย | ฟังแล้วแตะพยางค์ละ 1 จุดในแต่ละกลุ่ม ตรงที่เสียง
                {rising ? "ขึ้นสูงแล้วค้างไว้" : "สูงที่สุด"}
              </span>
            </>
          ) : rising ? (
            <>
              Listen, then tap the stressed syllable where the voice jumps up to level 3 and stays up.
              <span className="thai block">ฟังแล้วแตะพยางค์เน้นที่เสียงขึ้นไประดับ 3 แล้วค้างไว้</span>
            </>
          ) : (
            <>
              Listen, then tap the syllable where the voice goes highest.
              <span className="thai block">ฟังแล้วแตะพยางค์ที่เสียงขึ้นสูงสุด</span>
            </>
          )}
        </p>
      </div>

      <ListenButton sentence={sentence} />

      <div className="card flex flex-wrap items-end gap-x-3 gap-y-5 p-4" role="group" aria-label="Syllables">
        {groups.map((group, gi) => (
          <div key={gi} className="contents" role="group" aria-label={many ? `Thought group ${gi + 1}` : undefined}>
            {gi > 0 && (
              <span className="self-center px-0.5 text-3xl font-black text-muted" aria-hidden>
                |
              </span>
            )}
            {group.words.map((w, wi) => (
              <div key={wi} className="flex flex-col items-center gap-1">
                <div className="flex">
                  {w.syllables.map((s, si) => {
                    const pick = picks[gi];
                    const isPicked = pick?.word === wi && pick.syllable === si;
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
                        onClick={() => setPicks((list) => list.map((p, i) => (i === gi ? { word: wi, syllable: si } : p)))}
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
        ))}
      </div>
      {many && !locked && remaining > 0 && (
        <p className="text-sm font-semibold text-muted" role="status">
          {remaining === groups.length
            ? `Tap one syllable in each of the ${groups.length} groups.`
            : `${remaining} more to go: tap a syllable in the other group.`}
          <span className="thai block font-normal">
            {remaining === groups.length ? `แตะพยางค์ละ 1 จุดในทั้ง ${groups.length} กลุ่ม` : `เหลืออีก ${remaining} กลุ่ม แตะพยางค์ในกลุ่มที่เหลือ`}
          </span>
        </p>
      )}
    </div>
  );
}

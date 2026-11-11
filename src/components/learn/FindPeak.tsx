"use client";

import { useEffect, useState } from "react";
import type { Sentence } from "@/lib/intonation/types";
import { peakFeedback } from "@/lib/learn/feedback";
import type { PeakExercise } from "@/lib/learn/exercises";
import { classIpa } from "@/lib/ipa/notation";
import { rightWrong } from "@/lib/learn/score";
import { Bi } from "@/components/home/lang";
import { MynaSays, Prompt, SpeakerButton } from "./ui";
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
    <div className="flex flex-col gap-6">
      <Prompt
        title={
          many
            ? { en: "Tap the peak in each group", th: "แตะจุดสูงสุดของแต่ละกลุ่มคำ" }
            : rising
              ? { en: "Tap where the rise starts", th: "แตะพยางค์ที่เสียงเริ่มขึ้นสูง" }
              : { en: "Tap the peak", th: "แตะพยางค์ที่เสียงสูงที่สุด" }
        }
        tip={
          many
            ? {
                en: `${groups.length} thought groups, split by |. Tap one syllable in each, where the voice ${rising ? "jumps up and stays up" : "goes highest"}. Hint: the last important word.`,
                th: `มี ${groups.length} กลุ่มคำ คั่นด้วย | แตะพยางค์ละ 1 จุดในแต่ละกลุ่ม ตรงที่เสียง${rising ? "ขึ้นสูงแล้วค้างไว้" : "สูงที่สุด"} ใบ้: คำสำคัญคำสุดท้าย`,
              }
            : rising
              ? { en: "The voice jumps up to level 3 on a stressed syllable and stays up. Hint: the last important word.", th: "เสียงขึ้นไประดับ 3 ที่พยางค์เน้นแล้วค้างไว้ ใบ้: คำสำคัญคำสุดท้าย" }
              : { en: "The voice goes up to level 3 once, then falls. Hint: the stressed syllable of the last important word.", th: "เสียงขึ้นไประดับ 3 ครั้งเดียวแล้วตก ใบ้: พยางค์เน้นของคำสำคัญคำสุดท้าย" }
        }
      />
      <MynaSays>
        <div className="flex items-center gap-3">
          <SpeakerButton sentence={sentence} size="md" />
          <span className="text-sm font-bold text-muted">
            <Bi text={{ en: "Listen, then tap a syllable below.", th: "ฟังแล้วแตะพยางค์ด้านล่าง" }} />
          </span>
        </div>
      </MynaSays>

      <div className="flex flex-wrap items-end gap-x-3 gap-y-5 py-2" role="group" aria-label="Syllables">
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
                    const tone = locked && isRight ? "is-right" : locked && isPicked ? "is-wrong shake" : isPicked ? "is-on" : "";
                    return (
                      <button
                        key={si}
                        type="button"
                        disabled={locked}
                        aria-pressed={isPicked}
                        onClick={() => {
                          setPicks((list) => list.map((p, i) => (i === gi ? { word: wi, syllable: si } : p)));
                        }}
                        className={`pick min-h-12 min-w-10 px-1.5 text-xl font-bold sm:text-2xl ${tone} ${
                          w.syllables.length > 1 && si > 0 ? "ml-1" : ""
                        }`}
                      >
                        {s.text}
                        {si === w.syllables.length - 1 ? w.text.replace(/^.*?([^A-Za-z']*)$/, "$1") : ""}
                      </button>
                    );
                  })}
                </div>
                {/* no stress marks here: they would give the answer away */}
                <span className="ipa text-sm text-muted">/{classIpa(w.syllables.map((s) => s.ipa).join(""))}/</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {many && !locked && remaining > 0 && (
        <p className="text-sm font-semibold text-muted" role="status">
          <Bi
            text={
              remaining === groups.length
                ? { en: `Tap one syllable in each of the ${groups.length} groups.`, th: `แตะพยางค์ละ 1 จุดในทั้ง ${groups.length} กลุ่ม` }
                : { en: `${remaining} more to go: tap a syllable in the other group.`, th: `เหลืออีก ${remaining} กลุ่ม แตะพยางค์ในกลุ่มที่เหลือ` }
            }
          />
        </p>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Bi } from "@/components/home/lang";
import type { Sentence } from "@/lib/intonation/types";
import { buildFeedback, sameTune, tuneTiles } from "@/lib/learn/build";
import type { BuildExercise } from "@/lib/learn/exercises";
import { rightWrong } from "@/lib/learn/score";
import { playTap, playUntap } from "./chime";
import { MynaSays, Prompt, SpeakerButton } from "./ui";
import type { ExerciseApi } from "./types";

/**
 * Build the tune: listen, then tap level tiles into the answer line (2 3 1, or 2 3 2 | 2 3 1 for two thought groups).
 * Tap a tile in the line to send it back. Like a word bank: each tile can be used once.
 */
export function BuildTune({
  exercise,
  sentence,
  locked,
  api,
}: {
  exercise: BuildExercise;
  sentence: Sentence;
  locked: boolean;
  api: ExerciseApi;
}) {
  /** Indexes into the bank, in the order they were placed. */
  const [line, setLine] = useState<number[]>([]);
  const answer = useMemo(() => tuneTiles(sentence), [sentence]);
  const many = sentence.groups.length > 1;
  const { setCheck } = api;

  useEffect(() => {
    if (line.length === 0) return setCheck(null);
    setCheck(() => {
      const right = sameTune(
        line.map((i) => exercise.bank[i]),
        answer,
      );
      return { outcome: rightWrong(exercise.id, "build", right), feedback: buildFeedback(right, sentence) };
    });
  }, [line, answer, exercise, sentence, setCheck]);

  const place = (i: number) => {
    if (locked || line.includes(i)) return;
    playTap();
    setLine((l) => [...l, i]);
  };
  const unplace = (i: number) => {
    if (locked) return;
    playUntap();
    setLine((l) => l.filter((x) => x !== i));
  };

  const right = locked && sameTune(line.map((i) => exercise.bank[i]), answer);

  return (
    <div className="flex flex-col gap-6">
      <Prompt
        title={{ en: "Build the tune", th: "เรียงระดับเสียง" }}
        tip={
          many
            ? {
                en: "Each thought group gets its own levels. Put | between the groups. 2 = normal, 3 = high, 1 = low.",
                th: "แต่ละกลุ่มคำมีระดับเสียงของตัวเอง ใส่ | คั่นระหว่างกลุ่ม 2 = ปกติ 3 = สูง 1 = ต่ำ",
              }
            : {
                en: "Start at 2 (normal), go to 3 on the peak, then end where the voice ends: 1 low, or stay at 3.",
                th: "เริ่มที่ 2 (ปกติ) ขึ้นไป 3 ที่จุดสูงสุด แล้วจบตามเสียง: ลงไป 1 หรือค้างที่ 3",
              }
        }
      />
      <MynaSays>
        <div className="flex items-center gap-3">
          <SpeakerButton sentence={sentence} size="md" />
          <p className="min-w-0 text-xl font-bold leading-snug">
            {sentence.groups.map((g, gi) => (
              <span key={gi}>
                {gi > 0 && <span className="mx-1.5 font-black text-muted">|</span>}
                {g.words.map((w) => w.text).join(" ")}
              </span>
            ))}
          </p>
        </div>
      </MynaSays>

      {/* the answer line */}
      <div
        className={`flex min-h-[4.5rem] flex-wrap items-center gap-2 border-b-2 border-t-2 py-3 ${locked ? (right ? "border-good" : "border-bad") : "border-line"}`}
        aria-label="Your tune"
        role="group"
      >
        {line.length === 0 && (
          <span className="px-1 text-sm font-semibold text-muted">
            <Bi text={{ en: "Tap the tiles below in order", th: "แตะตัวเลขด้านล่างตามลำดับ" }} />
          </span>
        )}
        {line.map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => unplace(i)}
            disabled={locked}
            aria-label={`Remove ${exercise.bank[i] === "|" ? "group break" : `level ${exercise.bank[i]}`}`}
            className={`pick pop-in flex h-14 min-w-12 items-center justify-center px-3 text-2xl font-black ${locked ? (right ? "is-right" : "is-wrong") : ""}`}
          >
            {exercise.bank[i]}
          </button>
        ))}
      </div>

      {/* the bank: a used tile leaves a grey hole where it was */}
      <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Tiles">
        {exercise.bank.map((t, i) =>
          line.includes(i) ? (
            <span key={i} className="slot h-14 min-w-12 bg-line/60" aria-hidden />
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => place(i)}
              disabled={locked}
              aria-label={t === "|" ? "Group break" : `Level ${t}`}
              className="pick flex h-14 min-w-12 items-center justify-center px-3 text-2xl font-black"
            >
              {t}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

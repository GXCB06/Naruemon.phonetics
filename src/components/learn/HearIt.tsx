"use client";

import { useEffect, useState } from "react";
import type { Sentence } from "@/lib/intonation/types";
import { endingOf, type Ending, type HearExercise } from "@/lib/learn/exercises";
import { hearFeedback } from "@/lib/learn/feedback";
import { isTagSentence, tagHearFeedback, tagHearHint, tagHearQuestion } from "@/lib/learn/meaning";
import { rightWrong } from "@/lib/learn/score";
import { ListenButton, PlaceholderBadge } from "./ListenButton";
import type { ExerciseApi } from "./types";

const NAMES = ["A", "B"] as const;

const QUESTION: Record<Ending, { en: string; th: string }> = {
  falling: { en: "Which one is the falling tune?", th: "อันไหนคือเสียงตก?" },
  rising: { en: "Which one is the rising tune?", th: "อันไหนคือเสียงขึ้น?" },
};

/** The one-line reminder under the question: what the asked-for tune sounds like, for this kind of sentence. */
function hint(ask: Ending, textbook: Ending, groups: number): { en: string; th: string } {
  if (ask === "falling" && textbook === "falling") {
    return {
      en: "A falling sentence goes up to one peak, then ends low (2-3-1).",
      th: "เสียงตกจะขึ้นสูงที่จุดเดียวแล้วจบด้วยเสียงต่ำ (2-3-1)",
    };
  }
  if (ask === "rising" && textbook === "rising") {
    return groups > 1
      ? {
          en: "Each part goes up on its last important word and stays up at the end (2-3). Which clip does that?",
          th: "แต่ละกลุ่มคำขึ้นสูงที่คำสำคัญคำสุดท้ายแล้วค้างเสียงสูงไว้ (2-3) เสียงไหนเป็นแบบนั้น?",
        }
      : {
          en: "A rising sentence goes up on its last important word and stays up at the end (2-3).",
          th: "เสียงขึ้นจะขึ้นสูงที่คำสำคัญคำสุดท้ายแล้วค้างเสียงสูงไว้จนจบ (2-3)",
        };
  }
  if (ask === "falling") {
    return {
      en: "A yes/no question or a name should NOT fall. Find the clip that ends low.",
      th: "คำถาม Yes/No และการเรียกชื่อไม่ควรลงต่ำ หาเสียงที่จบด้วยเสียงต่ำ",
    };
  }
  return {
    en: "This sentence should fall. Find the clip that ends high.",
    th: "ประโยคนี้ต้องลงต่ำ หาเสียงที่จบด้วยเสียงสูง",
  };
}

/**
 * Hear it: two clips of the same sentence, pick the one with the asked-for tune: falling (2-3-1) in falling lessons,
 * rising (2-3) in rising lessons (which also ask "which one falls?" now and then to catch the typical mistake).
 */
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
  const ask = exercise.ask;
  const textbook = endingOf(sentence);
  const tune = ask === "rising" ? "rising" : "falling";
  const tag = isTagSentence(sentence); // tag questions ask "which one sounds sure / like a real question?"
  const question = tag ? tagHearQuestion(ask) : QUESTION[ask];
  const hintText = tag ? tagHearHint(ask) : hint(ask, textbook, sentence.groups.length);

  useEffect(() => {
    if (picked === null) return setCheck(null);
    setCheck(() => {
      const right = picked === exercise.correct;
      const other = exercise.clips[exercise.correct === 0 ? 1 : 0];
      const feedback = tag ? tagHearFeedback(right, ask, other) : hearFeedback(right, other, ask, textbook);
      return { outcome: rightWrong(exercise.id, "hear", right), feedback };
    });
  }, [picked, exercise, ask, textbook, tag, setCheck]);

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
          {question.en}
          <span className="thai block text-lg font-bold text-muted">{question.th}</span>
        </h1>
        <p className="mt-3 text-xl font-bold">“{sentence.text}”</p>
        <p className="mt-1 text-sm text-muted">
          {hintText.en}
          <span className="thai block">{hintText.th}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={tag ? (ask === "falling" ? "Pick the clip that sounds sure" : "Pick the clip that sounds like a real question") : `Pick the ${tune} clip`}>
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
                aria-label={tag ? `Clip ${NAMES[i]} is the answer` : `Clip ${NAMES[i]} is the ${tune} tune`}
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

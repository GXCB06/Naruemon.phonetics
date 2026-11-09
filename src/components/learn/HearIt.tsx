"use client";

import { useEffect, useState } from "react";
import type { Sentence } from "@/lib/intonation/types";
import { endingOf, type HearAsk, type HearExercise } from "@/lib/learn/exercises";
import { hearFeedback } from "@/lib/learn/feedback";
import { rightWrong } from "@/lib/learn/score";
import { ListenButton, PlaceholderBadge } from "./ListenButton";
import type { ExerciseApi } from "./types";

const NAMES = ["A", "B"] as const;

const QUESTION: Record<HearAsk, { en: string; th: string }> = {
  falling: { en: "Which one is the falling tune?", th: "อันไหนคือเสียงตก?" },
  rising: { en: "Which one is the rising tune?", th: "อันไหนคือเสียงขึ้น?" },
  unfinished: { en: "Which one sounds UNFINISHED?", th: "อันไหนฟังดูยังไม่จบ?" },
  finished: { en: "Which one sounds FINISHED after the first part?", th: "อันไหนฟังเหมือนจบแล้วหลังส่วนแรก?" },
  lifting: { en: "Which one goes UP on every item?", th: "อันไหนขึ้นเสียงทุกรายการ?" },
};

/** Words for the radio buttons' accessible names: "Pick the <pick> clip" / "Clip A is the <is> tune". */
const NAME: Record<HearAsk, { pick: string; is: string }> = {
  falling: { pick: "falling", is: "falling tune" },
  rising: { pick: "rising", is: "rising tune" },
  unfinished: { pick: "unfinished", is: "unfinished one" },
  finished: { pick: "finished-sounding", is: "finished-sounding one" },
  lifting: { pick: "rises-on-every-item", is: "one that rises on every item" },
};

/** The one-line reminder under the question: what the asked-for tune sounds like, for this kind of sentence. */
function hint(ask: HearAsk, textbook: "falling" | "rising", groups: number): { en: string; th: string } {
  if (ask === "unfinished") {
    return {
      en: "Before the last part, the voice rises to 3 and comes back to 2 (2-3-2), not all the way down to 1. Only the last part falls to low.",
      th: "ก่อนส่วนสุดท้าย เสียงขึ้นไประดับ 3 แล้วกลับมาที่ระดับ 2 (2-3-2) ไม่ลงไปถึงระดับ 1 มีแค่ส่วนสุดท้ายที่ลงต่ำ",
    };
  }
  if (ask === "finished") {
    return {
      en: "A part that is finished drops to LOW (level 1). Find the clip that drops after the first part, as if the sentence had ended.",
      th: "ส่วนที่จบแล้วจะลงต่ำ (ระดับ 1) หาเสียงที่ลงต่ำหลังส่วนแรก เหมือนประโยคจบไปแล้ว",
    };
  }
  if (ask === "lifting") {
    return textbook === "falling"
      ? {
          en: "Each item rises (2-3), so we know more is coming. Only the last item of a statement comes down to low (2-3-1).",
          th: "ทุกรายการขึ้นเสียง (2-3) เพื่อบอกว่ายังมีต่อ มีแค่รายการสุดท้ายของประโยคบอกเล่าที่ลงต่ำ (2-3-1)",
        }
      : {
          en: "Each choice rises (2-3), the last one too, because the speaker is asking.",
          th: "ทุกตัวเลือกขึ้นเสียง (2-3) รวมถึงตัวเลือกสุดท้ายด้วย เพราะผู้พูดกำลังถามอยู่",
        };
  }
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

  useEffect(() => {
    if (picked === null) return setCheck(null);
    setCheck(() => {
      const right = picked === exercise.correct;
      const other = exercise.clips[exercise.correct === 0 ? 1 : 0];
      return { outcome: rightWrong(exercise.id, "hear", right), feedback: hearFeedback(right, other, ask, textbook) };
    });
  }, [picked, exercise, ask, textbook, setCheck]);

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
          {QUESTION[ask].en}
          <span className="thai block text-lg font-bold text-muted">{QUESTION[ask].th}</span>
        </h1>
        <p className="mt-3 text-xl font-bold">“{sentence.text}”</p>
        <p className="mt-1 text-sm text-muted">
          {hint(ask, textbook, sentence.groups.length).en}
          <span className="thai block">{hint(ask, textbook, sentence.groups.length).th}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={`Pick the ${NAME[ask].pick} clip`}>
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
                aria-label={`Clip ${NAMES[i]} is the ${NAME[ask].is}`}
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

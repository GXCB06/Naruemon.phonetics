"use client";

import { useEffect, useState } from "react";
import type { Sentence } from "@/lib/intonation/types";
import { endingOf, type Ending, type HearAsk, type HearExercise } from "@/lib/learn/exercises";
import { hearFeedback } from "@/lib/learn/feedback";
import { isTagSentence, tagHearFeedback, tagHearHint, tagHearQuestion } from "@/lib/learn/meaning";
import { rightWrong } from "@/lib/learn/score";
import { Bi } from "@/components/home/lang";
import { PlaceholderBadge } from "./ListenButton";
import { prefetchVariants } from "./playReference";
import { MynaSays, Prompt, SpeakerIcon, useClip, useNumberKeys } from "./ui";
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
  const tag = isTagSentence(sentence); // tag questions ask "which one sounds sure / like a real question?"
  const tagAsk: Ending = ask === "rising" ? "rising" : "falling";
  const question = tag ? tagHearQuestion(tagAsk) : QUESTION[ask];
  const hintText = tag ? tagHearHint(tagAsk) : hint(ask, textbook, sentence.groups.length);

  useEffect(() => {
    if (picked === null) return setCheck(null);
    setCheck(() => {
      const right = picked === exercise.correct;
      const other = exercise.clips[exercise.correct === 0 ? 1 : 0];
      const feedback = tag ? tagHearFeedback(right, tagAsk, other) : hearFeedback(right, other, ask, textbook);
      return { outcome: rightWrong(exercise.id, "hear", right), feedback };
    });
  }, [picked, exercise, ask, tagAsk, textbook, tag, setCheck]);

  const { play, playing, source } = useClip();
  useEffect(() => {
    void prefetchVariants(sentence, exercise.clips);
  }, [sentence, exercise.clips]);
  const choose = (i: 0 | 1) => {
    // tap = hear it (also after CHECK): the real voice when both clips exist, otherwise the synthetic one for both
    void play(`c${i}`, sentence, { variant: exercise.clips[i], forceSynth: true, realVariants: exercise.clips });
    if (!locked) setPicked(i);
  };
  useNumberKeys(2, (i) => choose(i as 0 | 1), true);

  return (
    <div className="flex flex-col gap-6">
      {notice && (
        <p className="rounded-2xl bg-accent-soft p-3 text-sm font-bold text-accent" role="status">
          <Bi text={notice} />
        </p>
      )}
      <Prompt title={question} tip={hintText} />
      <MynaSays>
        <p className="text-xl font-bold leading-snug sm:text-2xl">{sentence.text}</p>
      </MynaSays>

      <div
        className="grid grid-cols-2 gap-3 sm:gap-4"
        role="radiogroup"
        aria-label={tag ? (tagAsk === "falling" ? "Pick the clip that sounds sure" : "Pick the clip that sounds like a real question") : `Pick the ${NAME[ask].pick} clip`}
      >
        {([0, 1] as const).map((i) => {
          const isPicked = picked === i;
          const isRight = i === exercise.correct;
          const state = locked && isRight ? "is-right" : locked && isPicked ? "is-wrong shake" : "";
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={isPicked}
              aria-label={tag ? `Play clip ${NAMES[i]} and pick it` : `Play clip ${NAMES[i]}: is it the ${NAME[ask].is}?`}
              onClick={() => choose(i)}
              className={`pick flex aspect-[4/3] flex-col items-center justify-center gap-2 p-3 ${state}`}
            >
              <span className={`flex size-16 items-center justify-center rounded-2xl sm:size-20 ${isPicked || (locked && isRight) ? "bg-current/15" : "bg-accent-soft text-accent"}`}>
                <SpeakerIcon className="size-9 sm:size-11" on={playing === `c${i}`} />
              </span>
              <span className="flex items-center gap-2 text-xl font-black">
                <span className="key-hint max-sm:hidden" aria-hidden>
                  {i + 1}
                </span>
                {NAMES[i]}
              </span>
            </button>
          );
        })}
      </div>
      {source === "placeholder" && <PlaceholderBadge kind="practice" />}
    </div>
  );
}

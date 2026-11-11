"use client";

import { useEffect, useMemo, useState } from "react";
import type { Sentence } from "@/lib/intonation/types";
import type { MeaningExercise } from "@/lib/learn/exercises";
import {
  MEANING_CHOICES,
  MEANING_HINT,
  MEANING_QUESTION,
  meaningFeedback,
  situationFor,
  tagReadingOf,
  type TagReading,
} from "@/lib/learn/meaning";
import { contentKeys, loadLesson } from "@/lib/learn/content";
import { sameTextIds } from "@/lib/learn/reference";
import { rightWrong } from "@/lib/learn/score";
import { Bi } from "@/components/home/lang";
import { MynaSays, Prompt, SpeakerButton, useNumberKeys } from "./ui";
import type { ExerciseApi } from "./types";

/**
 * Meaning match (tag questions): a short scene, one clip of the sentence, and the question "What does the speaker mean?".
 * "I'm sure" is the falling tag (3-1), "I'm asking" the rising tag (2-3). The clip is the sentence's own reading, so the
 * learner has to hear what the tag does at the end.
 */
export function MeaningMatch({
  exercise,
  sentence,
  locked,
  api,
}: {
  exercise: MeaningExercise;
  sentence: Sentence;
  locked: boolean;
  api: ExerciseApi;
}) {
  const reading = tagReadingOf(sentence);
  const [picked, setPicked] = useState<TagReading | null>(null);
  const { setCheck } = api;
  const scene = situationFor(sentence);
  // The other reading of the same words (sure vs asking) must have a real clip in the same voice too; otherwise both play
  // the placeholder, so "real voice vs robot voice" can never give the meaning away.
  const twins = useMemo(() => {
    const all = contentKeys().flatMap((k) => {
      const [unit, lesson] = k.split("/");
      return loadLesson(unit, lesson)?.sentences ?? [];
    });
    return sameTextIds(sentence, all);
  }, [sentence]);

  useEffect(() => {
    if (picked === null || reading === null) return setCheck(null);
    setCheck(() => {
      const right = picked === reading;
      return { outcome: rightWrong(exercise.id, "meaning", right), feedback: meaningFeedback(right, reading) };
    });
  }, [picked, reading, exercise.id, setCheck]);

  const pick = (r: TagReading) => {
    if (locked) return;
    setPicked(r);
  };
  useNumberKeys(MEANING_CHOICES.length, (i) => pick(MEANING_CHOICES[i].reading), !locked);

  if (reading === null) return null; // not a tag question: the lesson file is wrong (tests catch this)

  return (
    <div className="flex flex-col gap-6">
      <Prompt title={MEANING_QUESTION} tip={MEANING_HINT} />

      <div className="rounded-2xl bg-accent-soft p-3 text-sm font-semibold" aria-label="Situation">
        <Bi text={scene} />
      </div>

      <MynaSays>
        <div className="flex items-center gap-3">
          <SpeakerButton sentence={sentence} fairWith={twins} size="md" />
          <p className="min-w-0 text-xl font-bold leading-snug">{sentence.text}</p>
        </div>
      </MynaSays>

      <div className="flex flex-col gap-3" role="radiogroup" aria-label="What does the speaker mean?">
        {MEANING_CHOICES.map((c, k) => {
          const isPicked = picked === c.reading;
          const isRight = c.reading === reading;
          const state = locked && isRight ? "is-right" : locked && isPicked ? "is-wrong shake" : "";
          return (
            <button
              key={c.reading}
              type="button"
              role="radio"
              aria-checked={isPicked}
              disabled={locked}
              onClick={() => pick(c.reading)}
              className={`pick flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left ${state}`}
            >
              <span className="key-hint" aria-hidden>
                {k + 1}
              </span>
              <span className="min-w-0">
                <Bi text={c.label} className="text-lg font-black" />
                <span className="mt-0.5 block text-sm font-semibold opacity-80">
                  <Bi text={c.tune} />
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

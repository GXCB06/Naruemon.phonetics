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
import { ListenButton } from "./ListenButton";
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

  if (reading === null) return null; // not a tag question: the lesson file is wrong (tests catch this)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-black leading-snug">
          {MEANING_QUESTION.en}
          <span className="thai block text-lg font-bold text-muted">{MEANING_QUESTION.th}</span>
        </h1>
        <p className="mt-1 text-sm text-muted">
          {MEANING_HINT.en}
          <span className="thai block">{MEANING_HINT.th}</span>
        </p>
      </div>

      <div className="card flex flex-col gap-3 p-4" aria-label="Situation">
        <p className="text-sm font-bold text-muted">
          Situation <span className="thai font-semibold">สถานการณ์</span>
        </p>
        <p className="font-semibold">
          {scene.en}
          <span className="thai block text-sm text-ink/80">{scene.th}</span>
        </p>
        <p className="text-xl font-bold">“{sentence.text}”</p>
        <ListenButton sentence={sentence} fairWith={twins} />
      </div>

      <div className="flex flex-col gap-3" role="radiogroup" aria-label="What does the speaker mean?">
        {MEANING_CHOICES.map((c) => {
          const isPicked = picked === c.reading;
          const isRight = c.reading === reading;
          const tone =
            locked && isRight
              ? "border-good bg-good-soft"
              : locked && isPicked
                ? "border-bad bg-bad-soft"
                : isPicked
                  ? "border-primary-deep bg-primary/20"
                  : "border-line bg-card";
          return (
            <button
              key={c.reading}
              type="button"
              role="radio"
              aria-checked={isPicked}
              disabled={locked}
              onClick={() => setPicked(c.reading)}
              className={`flex min-h-16 w-full flex-col items-start gap-0.5 rounded-2xl border-2 px-4 py-3 text-left ${tone}`}
            >
              <span className="text-lg font-black">
                {isPicked ? "✓ " : ""}
                {c.label.en} <span className="thai text-base font-bold">{c.label.th}</span>
              </span>
              <span className="text-sm font-semibold text-muted">
                {c.tune.en} <span className="thai">{c.tune.th}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

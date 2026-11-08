"use client";

import { useCallback, useMemo, useRef } from "react";
import { DrawingPad, type DrawingPadHandle } from "@/components/lab/DrawingPad";
import { layoutSentence, targetContour } from "@/lib/intonation/contour";
import type { Sentence } from "@/lib/intonation/types";
import type { DrawExercise } from "@/lib/learn/exercises";
import { analysisFeedback } from "@/lib/learn/feedback";
import { graded } from "@/lib/learn/score";
import { ListenButton } from "./ListenButton";
import type { ExerciseApi } from "./types";

/** Draw it: listen, then draw the tune over the four level lines; the lab's drawing pad and rule engine grade it. */
export function DrawIt({
  exercise,
  sentence,
  locked,
  api,
}: {
  exercise: DrawExercise;
  sentence: Sentence;
  locked: boolean;
  api: ExerciseApi;
}) {
  const layout = useMemo(() => layoutSentence(sentence), [sentence]);
  const target = useMemo(() => targetContour(layout), [layout]);
  const pad = useRef<DrawingPadHandle>(null);
  const { setCheck } = api;

  const onInkChange = useCallback(
    (hasInk: boolean) => {
      if (!hasInk) return setCheck(null);
      setCheck(() => {
        const r = pad.current?.check();
        if (!r) return null;
        const feedback = analysisFeedback(r);
        return { outcome: graded(exercise.id, "draw", r.overall, feedback.passed), feedback };
      });
    },
    [exercise.id, setCheck],
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-black leading-snug">
          Draw the tune
          <span className="thai block text-lg font-bold text-muted">วาดเส้นทำนองเสียง</span>
        </h1>
        <p className="mt-3 text-xl font-bold">“{sentence.text}”</p>
        <p className="mt-1 text-sm text-muted">
          Start at level 2, rise to 3 on the highlighted syllable, then fall to 1. Drag across the chart.
          <span className="thai block">เริ่มที่ระดับ 2 ขึ้นไประดับ 3 ที่พยางค์ที่เน้นสี แล้วลงระดับ 1 ลากนิ้วบนกราฟ</span>
        </p>
      </div>
      <ListenButton sentence={sentence} />
      <div className="card overflow-hidden p-2">
        <DrawingPad
          sentence={sentence}
          layout={layout}
          target={target}
          compact
          readOnly={locked}
          onInkChange={onInkChange}
          handleRef={pad}
        />
      </div>
    </div>
  );
}

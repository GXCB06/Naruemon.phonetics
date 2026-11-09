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

/** What to draw, in words: the pattern of the sentence's groups, and (for several groups) where to lift the pen. */
function instructions(sentence: Sentence): { en: string; th: string } {
  const rising = sentence.groups.every((g) => g.pattern === "2-3");
  const many = sentence.groups.length > 1;
  if (rising) {
    return many
      ? {
          en: "Draw each thought group: start at level 2, rise to 3 on the highlighted syllable and stay up. Lift your finger at the | between the groups, then draw the second one.",
          th: "วาดทีละกลุ่มคำ เริ่มที่ระดับ 2 ขึ้นไประดับ 3 ที่พยางค์ที่เน้นสีแล้วค้างไว้ ยกนิ้วตรงเครื่องหมาย | ระหว่างกลุ่ม แล้วเริ่มวาดกลุ่มที่สอง",
        }
      : {
          en: "Start at level 2, rise to 3 on the highlighted syllable and stay up to the end. Drag across the chart.",
          th: "เริ่มที่ระดับ 2 ขึ้นไประดับ 3 ที่พยางค์ที่เน้นสี แล้วค้างเสียงสูงไว้จนจบ ลากนิ้วบนกราฟ",
        };
  }
  const last = sentence.groups[sentence.groups.length - 1].pattern;
  if (many && last === "2-3-1" && sentence.groups.some((g) => g.pattern === "2-3-2")) {
    return {
      en: "Draw each thought group. Before the last one: start at level 2, rise to 3 on the highlighted syllable and come BACK to 2, not 1. In the last group, rise to 3 then fall to 1. Lift your finger at each |.",
      th: "วาดทีละกลุ่มคำ กลุ่มก่อนสุดท้าย: เริ่มที่ระดับ 2 ขึ้นไประดับ 3 ที่พยางค์ที่เน้นสี แล้วกลับมาที่ระดับ 2 ไม่ใช่ 1 กลุ่มสุดท้าย: ขึ้นระดับ 3 แล้วลงระดับ 1 ยกนิ้วตรงเครื่องหมาย | แต่ละอัน",
    };
  }
  if (many && last === "2-3-1" && sentence.groups.slice(0, -1).every((g) => g.pattern === "2-3")) {
    return {
      en: "Draw each item. For every item but the last: start at level 2, rise to 3 on the highlighted syllable and stay up. For the last item, rise to 3 then fall to 1. Lift your finger at each |.",
      th: "วาดทีละรายการ ทุกรายการยกเว้นรายการสุดท้าย: เริ่มที่ระดับ 2 ขึ้นไประดับ 3 ที่พยางค์ที่เน้นสี แล้วค้างไว้ รายการสุดท้าย: ขึ้นระดับ 3 แล้วลงระดับ 1 ยกนิ้วตรงเครื่องหมาย | แต่ละอัน",
    };
  }
  return many
    ? {
        en: "Follow the pattern of each thought group. Lift your finger at the | between the groups, then draw the next one.",
        th: "วาดตามรูปแบบของแต่ละกลุ่มคำ ยกนิ้วตรงเครื่องหมาย | ระหว่างกลุ่ม แล้วเริ่มวาดกลุ่มถัดไป",
      }
    : {
        en: "Start at level 2, rise to 3 on the highlighted syllable, then fall to 1. Drag across the chart.",
        th: "เริ่มที่ระดับ 2 ขึ้นไประดับ 3 ที่พยางค์ที่เน้นสี แล้วลงระดับ 1 ลากนิ้วบนกราฟ",
      };
}

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
  const how = instructions(sentence);
  const { setCheck } = api;

  const onInkChange = useCallback(
    (hasInk: boolean) => {
      if (!hasInk) return setCheck(null);
      setCheck(() => {
        const r = pad.current?.check();
        if (!r) return null;
        const feedback = analysisFeedback(r);
        return { outcome: graded(exercise.id, "draw", r.overall, feedback.passed), feedback, analysis: r };
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
          {how.en}
          <span className="thai block">{how.th}</span>
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

"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { LessonPlayer } from "@/components/learn/LessonPlayer";
import { allSentences } from "@/lib/learn/content";
import { buildDrill, courseById, type CourseId } from "@/lib/practice/courses";

/** Runs a 10-question drill for a Practice course. The seed in the URL (?s=) picks the sentences; "practise again" adds one. */
export function DrillPlayer({ course }: { course: string }) {
  const params = useSearchParams();
  const raw = Number(params.get("s"));
  const seed = Number.isInteger(raw) && raw >= 0 && raw < 1_000_000 ? raw : 1;
  const info = courseById(course);
  const drill = useMemo(() => (info ? buildDrill(info.id as CourseId, seed, allSentences()) : null), [info, seed]);
  if (!info || !drill || drill.exercises.length === 0) return null;

  return (
    <LessonPlayer
      // a new seed is a new drill: start it from scratch
      key={`${drill.id}-${seed}`}
      unitId="practice"
      lesson={{ id: drill.id, unit: "practice", sentences: drill.sentences }}
      nextLessonId={null}
      presetExercises={drill.exercises}
      backHref="/practice"
      backLabel={{ en: "Back to Practice", th: "กลับไปหน้าฝึก" }}
      nextHref={`/practice/${info.id}?s=${seed + 1}`}
      nextLabel={{ en: "PRACTISE AGAIN", th: "ฝึกอีกรอบ" }}
    />
  );
}

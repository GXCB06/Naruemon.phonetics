import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LessonPlayer } from "@/components/learn/LessonPlayer";
import { LessonUnavailable } from "@/components/learn/LessonUnavailable";
import { getLessonMeta, getUnit, nextLessonId, UNITS } from "@/lib/course/units";
import { loadLesson } from "@/lib/learn/content";

export const metadata: Metadata = { title: "Lesson — Melobi" };

// Every lesson of an open unit is prerendered; other ids are checked when they are requested.
export function generateStaticParams() {
  return UNITS.filter((u) => !u.locked).flatMap((u) => u.lessons.map((l) => ({ unit: u.id, lesson: l.id })));
}

export default function LessonPage({ params }: PageProps<"/learn/[unit]/[lesson]">) {
  // The URL data is read inside Suspense so the page shell doesn't depend on one URL (Cache Components).
  return (
    <Suspense fallback={<LessonSkeleton />}>
      <Lesson params={params} />
    </Suspense>
  );
}

async function Lesson({ params }: { params: Promise<{ unit: string; lesson: string }> }) {
  const { unit: unitId, lesson: lessonId } = await params;
  const unit = getUnit(unitId);
  if (unit?.locked) return <LessonUnavailable reason="locked" />;
  if (!unit || !getLessonMeta(unitId, lessonId)) notFound();
  const lesson = loadLesson(unitId, lessonId);
  if (!lesson) return <LessonUnavailable reason="soon" />;
  return <LessonPlayer unitId={unitId} lesson={lesson} nextLessonId={nextLessonId(unitId, lessonId) ?? null} />;
}

function LessonSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-4" aria-busy="true">
      <div className="h-4 rounded-full bg-line" />
      <div className="h-8 w-2/3 rounded-xl bg-line" />
      <div className="h-40 rounded-2xl bg-line" />
      <span className="sr-only">Loading lesson…</span>
    </main>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DrillPlayer } from "@/components/practice/DrillPlayer";
import { COURSES, courseById } from "@/lib/practice/courses";

export const metadata: Metadata = { title: "Practice — Melobi", robots: { index: false } };

export function generateStaticParams() {
  return COURSES.map((c) => ({ course: c.id }));
}

export default function DrillPage({ params }: PageProps<"/practice/[course]">) {
  // The URL data is read inside Suspense so the page shell doesn't depend on one URL (Cache Components).
  return (
    <Suspense fallback={<Skeleton />}>
      <Drill params={params} />
    </Suspense>
  );
}

async function Drill({ params }: { params: Promise<{ course: string }> }) {
  const { course } = await params;
  if (!courseById(course)) notFound();
  // useSearchParams (the drill's seed) in the client component needs its own Suspense boundary
  return (
    <Suspense fallback={<Skeleton />}>
      <DrillPlayer course={course} />
    </Suspense>
  );
}

function Skeleton() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-4" aria-busy="true">
      <div className="h-4 rounded-full bg-line" />
      <div className="h-8 w-2/3 rounded-xl bg-line" />
      <div className="h-40 rounded-2xl bg-line" />
      <span className="sr-only">Loading practice…</span>
    </main>
  );
}

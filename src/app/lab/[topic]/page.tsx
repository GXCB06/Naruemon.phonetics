import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TopicList } from "@/components/speak/TopicList";
import { SPEAK_TOPICS, topicById } from "@/lib/speak/topics";

export const metadata: Metadata = { title: "Speak — Myna", robots: { index: false } };

export function generateStaticParams() {
  return SPEAK_TOPICS.map((t) => ({ topic: t.id }));
}

export default function TopicPage({ params }: PageProps<"/lab/[topic]">) {
  // The URL data is read inside Suspense so the page shell doesn't depend on one URL (Cache Components).
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-xl flex-1 px-4 py-6" aria-busy="true"><div className="card h-40 animate-pulse" /></main>}>
      <Topic params={params} />
    </Suspense>
  );
}

async function Topic({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  if (!topicById(topic)) notFound();
  return <TopicList topicId={topic} />;
}

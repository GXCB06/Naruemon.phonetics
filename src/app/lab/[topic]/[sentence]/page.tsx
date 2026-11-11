import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SpeakScreen } from "@/components/speak/SpeakScreen";
import { allSentences } from "@/lib/learn/content";
import { SPEAK_TOPICS, topicById, topicSentences } from "@/lib/speak/topics";

export const metadata: Metadata = { title: "Speak — Myna", robots: { index: false } };

export function generateStaticParams() {
  const all = allSentences();
  return SPEAK_TOPICS.flatMap((t) => topicSentences(t, all).map((s) => ({ topic: t.id, sentence: s.id })));
}

export default function SpeakSentencePage({ params }: PageProps<"/lab/[topic]/[sentence]">) {
  // The URL data is read inside Suspense so the page shell doesn't depend on one URL (Cache Components).
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6" aria-busy="true"><div className="card h-40 animate-pulse" /></main>}>
      <Sentence params={params} />
    </Suspense>
  );
}

async function Sentence({ params }: { params: Promise<{ topic: string; sentence: string }> }) {
  const { topic, sentence } = await params;
  const t = topicById(topic);
  if (!t || !topicSentences(t, allSentences()).some((s) => s.id === sentence)) notFound();
  return <SpeakScreen topicId={topic} sentenceId={sentence} />;
}

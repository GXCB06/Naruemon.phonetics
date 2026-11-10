"use client";

import Link from "next/link";
import { Bi, LangToggle } from "@/components/home/lang";
import { MynaBot } from "@/components/mascot/MynaBot";
import { COPY } from "./copy";
import { HeatMap } from "./HeatMap";
import { BackIcon } from "./icons";
import { Improvements } from "./Improvements";
import { Insights } from "./Insights";
import { Trend } from "./Trend";
import { useProgressData } from "./useProgressData";

function Skeleton() {
  return (
    <div role="status" aria-label="Loading · กำลังโหลด" className="flex flex-col gap-4">
      <div className="card h-40 animate-pulse" aria-hidden />
      <div className="card h-32 animate-pulse" aria-hidden />
      <div className="card h-32 animate-pulse" aria-hidden />
    </div>
  );
}

function EmptyState() {
  return (
    <section aria-labelledby="empty-title" className="card flex flex-col items-center gap-4 px-5 py-10 text-center">
      <MynaBot mood="wink" className="size-24" />
      <div className="flex flex-col gap-2">
        <h2 id="empty-title" className="text-2xl font-black">
          <Bi text={COPY.empty.title} className="items-center" />
        </h2>
        <p className="text-base font-semibold">
          <Bi text={COPY.empty.body} className="items-center" />
        </p>
      </div>
      <Link href="/" className="btn btn-primary min-h-12 px-6 text-base">
        <Bi text={COPY.empty.start} className="items-center" subClassName="text-primary-ink/80" />
      </Link>
    </section>
  );
}

export function ProgressScreen() {
  const data = useProgressData();

  return (
    <>
      <header className="sticky top-0 z-20 border-b-2 border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-2">
          <Link
            href="/"
            className="flex min-h-9 shrink-0 items-center gap-1 rounded-xl border-2 border-line bg-card px-2 text-sm font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label={`${COPY.back.en} · ${COPY.back.th}`}
          >
            <BackIcon />
            <span className="hidden sm:inline">Myna</span>
          </Link>
          <h1 className="min-w-0 truncate text-lg font-black leading-tight">
            <Bi text={COPY.title} />
          </h1>
          <div className="ml-auto">
            <LangToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 pb-16 pt-6">
        {/* Placeholder until local data is read and, on a brand-new device, until the server has answered, so a
            signed-in learner never sees the empty state flash up before their saved progress arrives. */}
        {data === null || (!data.settled && data.isEmpty) ? (
          <Skeleton />
        ) : data.isEmpty ? (
          <EmptyState />
        ) : (
          <>
            {data.heat.length > 0 && <HeatMap rows={data.heat} />}
            <Improvements items={data.improvements} hasEnoughSomewhere={data.hasEnoughSomewhere} />
            {data.insights.length > 0 && <Insights items={data.insights} />}
            <Trend days={data.trend} firstLatest={data.firstLatest} />
          </>
        )}
      </main>
    </>
  );
}

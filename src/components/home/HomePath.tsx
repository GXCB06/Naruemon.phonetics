"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MynaBot } from "@/components/mascot/MynaBot";
import { Onboarding } from "@/components/onboarding/Onboarding";
import { useOnboarded } from "@/components/onboarding/seen";
import { buildPath } from "@/lib/course/path.ts";
import type { PathNode } from "@/lib/course/path.ts";
import { COPY } from "./copy";
import { Bi } from "./lang";
import { LessonSheet } from "./LessonSheet";
import { UnitSection } from "./PathMap";
import { TopBar } from "./TopBar";
import { useProgress } from "./useProgress";

export function HomePath() {
  const { progress, streak } = useProgress();
  const path = useMemo(() => buildPath(progress.lessons), [progress.lessons]);
  const [tapped, setTapped] = useState<PathNode | null>(null);
  const [open, setOpen] = useState(false);
  const onboarded = useOnboarded();
  const openUnit = tapped ? (path.units.find((u) => u.id === tapped.unitId) ?? null) : null;
  // Re-read the node from the latest path so its state/stars stay current while the sheet is open.
  const openNode = tapped && openUnit ? (openUnit.nodes.find((n) => n.lessonId === tapped.lessonId) ?? null) : null;

  function openLesson(n: PathNode) {
    setTapped(n);
    setOpen(true);
  }

  // First open on this device: "How Myna works" instead of the path; finishing or skipping reveals the path.
  if (!onboarded) return <Onboarding inline />;

  return (
    <>
      <TopBar progress={progress} streak={streak} />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-4 pb-16 pt-6">
        <h1 className="sr-only">{COPY.path.en} · {COPY.path.th}</h1>

        {path.next === null && (
          <p role="status" className="card border-good bg-good-soft p-4 text-sm font-bold">
            <Bi text={COPY.allDone} />
          </p>
        )}

        <Link href="/ipa" className="card flex items-center gap-3 p-3 transition-transform hover:-translate-y-0.5 active:translate-y-0.5">
          <MynaBot mood="wink" className="h-14 w-14" />
          <span className="min-w-0 flex-1">
            <span className="block font-black">
              IPA practice <span className="thai font-bold text-muted">ฝึกถอดเสียง IPA</span>
            </span>
            <span className="block text-sm font-semibold text-muted">
              Hear a word, build or write its IPA.
              <span className="thai block">ฟังคำศัพท์ แล้วเรียงหรือเขียน IPA</span>
            </span>
          </span>
          <span className="ipa shrink-0 text-xl font-bold text-accent" aria-hidden>
            /θɪŋk/
          </span>
        </Link>

        {path.units.map((unit) => (
          <UnitSection key={unit.id} unit={unit} onOpen={openLesson} />
        ))}

        <nav aria-label="More · เพิ่มเติม" className="mt-2 flex flex-wrap items-center justify-center gap-3 border-t-2 border-line pt-6">
          <Link href="/ipa" className="btn min-h-12 px-4 text-sm">
            <Bi text={{ en: "IPA practice", th: "ฝึก IPA" }} className="items-center" />
          </Link>
          <Link href="/lab" className="btn min-h-12 px-4 text-sm">
            <Bi text={COPY.lab} className="items-center" />
          </Link>
          <Link href="/login" className="btn min-h-12 px-4 text-sm">
            <Bi text={COPY.signIn} className="items-center" />
          </Link>
          <Link href="/welcome" className="btn min-h-12 px-4 text-sm">
            <Bi text={{ en: "How Myna works", th: "Myna ใช้งานยังไง" }} className="items-center" />
          </Link>
          <Link href="/mic-check" className="btn min-h-12 px-4 text-sm">
            <Bi text={{ en: "Mic check", th: "เช็กไมค์" }} className="items-center" />
          </Link>
        </nav>
      </main>
      <LessonSheet node={openNode} unit={openUnit} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

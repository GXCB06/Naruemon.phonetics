"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { playComplete } from "@/components/learn/chime";
import { MynaBot } from "@/components/mascot/MynaBot";
import { Onboarding } from "@/components/onboarding/Onboarding";
import { useOnboarded } from "@/components/onboarding/seen";
import { CHEST_XP, CHESTS_KEY, buildPath, parseOpenedChests, unitStops } from "@/lib/course/path.ts";
import type { PathNode, PathStop, PathUnit } from "@/lib/course/path.ts";
import { loadProgress, saveProgress } from "@/lib/progress/store.ts";
import { COPY } from "./copy";
import { Bi, useLang } from "./lang";
import { LessonSheet } from "./LessonSheet";
import { UnitSection, unitColor } from "./PathMap";
import { TopBar } from "./TopBar";
import { useProgress } from "./useProgress";

function readChests(): string | null {
  try {
    return localStorage.getItem(CHESTS_KEY);
  } catch {
    return null;
  }
}
const chestListeners = new Set<() => void>();
function subscribeChests(cb: () => void) {
  chestListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    chestListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function HomePath() {
  const { progress, streak } = useProgress();
  const router = useRouter();
  const lang = useLang();
  const path = useMemo(() => buildPath(progress.lessons), [progress.lessons]);
  const chestsRaw = useSyncExternalStore(subscribeChests, readChests, () => null);
  const opened = useMemo(() => parseOpenedChests(chestsRaw), [chestsRaw]);
  const [tapped, setTapped] = useState<PathNode | null>(null);
  const [open, setOpen] = useState(false);
  const [guide, setGuide] = useState<PathUnit | null>(null);
  const [reward, setReward] = useState<number | null>(null);
  const onboarded = useOnboarded();
  const currentRef = useRef<HTMLLIElement | null>(null);
  const [jump, setJump] = useState<"up" | "down" | null>(null);

  const openUnit = tapped ? (path.units.find((u) => u.id === tapped.unitId) ?? null) : null;
  const openNode = tapped && openUnit ? (openUnit.nodes.find((n) => n.lessonId === tapped.lessonId) ?? null) : null;

  // Show the "jump to my lesson" button when the current stop is off screen.
  useEffect(() => {
    const el = currentRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      setJump(e.isIntersecting ? null : e.boundingClientRect.top < 0 ? "up" : "down");
    });
    io.observe(el);
    return () => io.disconnect();
  }, [path.next?.lessonId, onboarded]);

  function openLesson(n: PathNode) {
    setTapped(n);
    setOpen(true);
  }

  function onStop(stop: PathStop, unit: PathUnit) {
    if (stop.kind === "ipa") return router.push("/ipa");
    if (stop.kind === "chest" && stop.state === "available") {
      playComplete(); // inside the tap (iPad)
      const p = loadProgress();
      saveProgress({ ...p, xp: p.xp + CHEST_XP });
      try {
        localStorage.setItem(CHESTS_KEY, JSON.stringify([...opened, unit.id]));
      } catch {
        // not remembered on this device
      }
      chestListeners.forEach((l) => l());
      window.dispatchEvent(new Event("focus")); // useProgress re-reads the XP
      setReward(CHEST_XP);
      setTimeout(() => setReward(null), 2200);
    }
  }

  // First open on this device: "How Melobi works" instead of the path; finishing or skipping reveals the path.
  if (!onboarded) return <Onboarding inline />;

  return (
    <>
      <TopBar progress={progress} streak={streak} />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-10 px-4 pb-10 pt-4">
        <h1 className="sr-only">
          {COPY.path.en} · {COPY.path.th}
        </h1>

        {path.next === null && (
          <p role="status" className="card border-good bg-good-soft p-4 text-sm font-bold">
            <Bi text={COPY.allDone} />
          </p>
        )}

        {path.units.map((unit, i) => (
          <UnitSection
            key={unit.id}
            unit={unit}
            first={i === 0}
            stops={unitStops(unit, opened)}
            onOpen={openLesson}
            onStop={onStop}
            onGuide={setGuide}
            currentRef={currentRef}
          />
        ))}
      </main>

      {jump && (
        <button
          type="button"
          onClick={() => currentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
          aria-label={lang === "th" ? "ไปที่บทเรียนปัจจุบัน" : "Jump to my lesson"}
          className="pop-in fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-20 flex size-14 items-center justify-center rounded-2xl border-2 border-b-4 border-line bg-card text-accent shadow-lg sm:right-[max(1rem,calc(50%-18rem))]"
        >
          <svg viewBox="0 0 24 24" className={`size-7 ${jump === "up" ? "rotate-180" : ""}`} aria-hidden fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4v15M5 12l7 7 7-7" />
          </svg>
        </button>
      )}

      {reward !== null && (
        <div role="status" className="pop-in fixed inset-x-0 top-24 z-30 mx-auto flex w-fit items-center gap-3 rounded-2xl border-2 border-b-4 border-warn bg-card px-5 py-3 shadow-xl">
          <MynaBot mood="perfect" className="size-12" />
          <p className="text-lg font-black text-warn">
            +{reward} XP <span className="thai text-base">โบนัสหีบรางวัล!</span>
          </p>
        </div>
      )}

      <LessonSheet node={openNode} unit={openUnit} open={open} onClose={() => setOpen(false)} />
      <GuideSheet unit={guide} onClose={() => setGuide(null)} />
    </>
  );
}

/** The unit guidebook: what the tune is for, and the unit's lessons. */
function GuideSheet({ unit, onClose }: { unit: PathUnit | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const lang = useLang();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (unit && !d.open) d.showModal();
    if (!unit && d.open) d.close();
  }, [unit]);
  return (
    <dialog
      ref={ref}
      aria-label={lang === "th" ? "คู่มือยูนิต" : "Unit guidebook"}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="fixed inset-x-0 bottom-0 top-auto m-0 hidden max-h-[85dvh] w-full max-w-none flex-col overflow-y-auto rounded-t-3xl border-2 border-b-0 border-line bg-card p-0 text-ink shadow-2xl open:flex backdrop:bg-black/45 sm:mx-auto sm:max-w-lg"
    >
      {unit && (
        <div className="flex flex-col gap-4 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5" style={unitColor(unit.number)}>
          <div className="unit-banner rounded-2xl px-4 py-3">
            <p className="text-xs font-black uppercase tracking-wider text-white/80">
              {lang === "th" ? `คู่มือ · ยูนิต ${unit.number}` : `Guidebook · Unit ${unit.number}`}
            </p>
            <h2 className="text-xl font-black leading-tight">
              <Bi text={unit.title} subClassName="text-white/80!" />
            </h2>
          </div>
          <div className="flex items-start gap-3">
            <MynaBot mood="wink" className="size-14 shrink-0" />
            <p className="bubble flex-1 p-3 font-semibold">
              <Bi text={unit.blurb} />
            </p>
          </div>
          <ol className="flex flex-col gap-2">
            {unit.nodes.map((n, i) => (
              <li key={n.lessonId} className="flex items-center gap-3 rounded-xl border-2 border-line px-3 py-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--u)] text-sm font-black text-white">{i + 1}</span>
                <Bi text={n.title} className="min-w-0 flex-1 font-bold" />
                {n.state === "done" && <span className="text-sm font-black text-good">✓</span>}
              </li>
            ))}
          </ol>
          <button type="button" className="btn w-full" onClick={onClose}>
            <Bi text={{ en: "Close", th: "ปิด" }} className="items-center" />
          </button>
        </div>
      )}
    </dialog>
  );
}

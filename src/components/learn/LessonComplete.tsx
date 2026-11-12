"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { MynaBot } from "@/components/mascot/MynaBot";
import type { LessonSummary } from "@/lib/learn/score";
import { MISSION } from "./chime";

/** Counts from 0 up to `to` after `delayMs`, so the number arrives as an event; shows the final value at once with reduced motion. */
function useCountUp(to: number, delayMs: number, durationMs = 700): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => setN(to));
      return () => cancelAnimationFrame(id);
    }
    let raf = 0;
    const start = performance.now() + delayMs;
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - start) / durationMs));
      setN(Math.round(to * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, delayMs, durationMs]);
  return n;
}

/** A short burst of confetti from behind the stars: only for a lesson that earned stars. Pure CSS, fixed pieces. */
function Confetti() {
  const colors = ["var(--primary)", "var(--accent)", "var(--good)", "var(--warn)"];
  return (
    <div className="confetti" aria-hidden>
      {Array.from({ length: 18 }, (_, i) => {
        const angle = (i / 18) * Math.PI * 2;
        const dist = 90 + (i % 3) * 35;
        const style = {
          "--x": `${Math.round(Math.cos(angle) * dist)}px`,
          "--y": `${Math.round(Math.sin(angle) * dist * 0.75 - 30)}px`,
          "--r": `${(i * 47) % 360}deg`,
          background: colors[i % colors.length],
          animationDelay: `${MISSION.starsAt * 1000 - 80}ms`,
        } as CSSProperties;
        return <span key={i} style={style} />;
      })}
    </div>
  );
}

/** The last screen: the bot's reaction, score, stars, XP earned and where to go next. */
export function LessonComplete({
  summary,
  streak,
  bestCombo = 0,
  nextHref,
  nextLabel = { en: "NEXT LESSON", th: "บทต่อไป" },
  backHref = "/",
  backLabel = { en: "Back to the path", th: "กลับไปหน้าหลัก" },
}: {
  summary: LessonSummary;
  streak: number;
  /** Most correct answers in a row during the lesson. */
  bestCombo?: number;
  /** Link to the next lesson of the unit, if there is one. */
  nextHref: string | null;
  nextLabel?: { en: string; th: string };
  backHref?: string;
  backLabel?: { en: string; th: string };
}) {
  const headline =
    summary.stars === 3
      ? { en: "Perfect tune!", th: "ทำนองเสียงเยี่ยมมาก!" }
      : summary.stars >= 1
        ? { en: "Lesson complete!", th: "จบบทเรียนแล้ว!" }
        : { en: "Lesson finished", th: "จบบทเรียนแล้ว" };
  const score = useCountUp(summary.score, MISSION.starsAt * 1000 + 3 * MISSION.starGap * 1000);
  const xp = useCountUp(summary.xp, MISSION.starsAt * 1000 + 3 * MISSION.starGap * 1000 + 250);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <p className="mission-stamp rounded-xl border-4 border-good px-4 py-1 text-lg font-black uppercase tracking-[0.18em] text-good" role="status">
        Mission complete<span className="thai block text-sm normal-case tracking-normal">ภารกิจสำเร็จ!</span>
      </p>
      <MynaBot mood={summary.stars === 3 ? "perfect" : summary.stars >= 1 ? "happy" : "wink"} className="h-32 w-32" />
      <div className="relative flex gap-2 text-6xl" role="img" aria-label={`${summary.stars} of 3 stars`}>
        {summary.stars > 0 && <Confetti />}
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={n <= summary.stars ? "star-pop text-primary" : "star-dim text-line"}
            style={{ animationDelay: `${(MISSION.starsAt + (n - 1) * MISSION.starGap) * 1000}ms` }}
            aria-hidden
          >
            ★
          </span>
        ))}
      </div>
      <h1 className="text-3xl font-black tracking-tight">
        {headline.en}
        <span className="thai block text-xl font-bold text-muted">{headline.th}</span>
      </h1>

      <dl className="grid w-full grid-cols-3 gap-3">
        <div className="card p-3">
          <dt className="text-xs font-extrabold uppercase tracking-wide text-muted">
            Score<span className="thai block normal-case">คะแนน</span>
          </dt>
          <dd className="text-3xl font-black tabular-nums text-accent">{score}%</dd>
        </div>
        <div className="card p-3">
          <dt className="text-xs font-extrabold uppercase tracking-wide text-muted">
            XP<span className="thai block normal-case">XP</span>
          </dt>
          <dd className="text-3xl font-black tabular-nums text-warn">+{xp}</dd>
        </div>
        <div className="card p-3">
          <dt className="text-xs font-extrabold uppercase tracking-wide text-muted">
            Streak<span className="thai block normal-case">ต่อเนื่อง</span>
          </dt>
          <dd className="text-3xl font-black tabular-nums">
            {streak}
            <span aria-hidden> 🔥</span>
          </dd>
        </div>
      </dl>
      <p className="text-sm text-muted">
        {summary.passed} of {summary.total} exercises nailed. Best combo: ×{bestCombo}.
        <span className="thai block">
          ทำได้ดี {summary.passed} จาก {summary.total} ข้อ · ต่อเนื่องสูงสุด {bestCombo} ข้อ
        </span>
      </p>

      <div className="fade-up flex w-full flex-col gap-3" style={{ animationDelay: `${(MISSION.starsAt + 3 * MISSION.starGap) * 1000 + 500}ms` }}>
        {nextHref && (
          <Link href={nextHref} className="btn btn-primary w-full py-4 text-lg">
            {nextLabel.en} <span className="thai text-base font-semibold">{nextLabel.th}</span>
          </Link>
        )}
        <Link href={backHref} className={`btn w-full py-4 text-lg ${nextHref ? "" : "btn-primary"}`}>
          {backLabel.en} <span className="thai text-base font-semibold">{backLabel.th}</span>
        </Link>
      </div>
    </main>
  );
}

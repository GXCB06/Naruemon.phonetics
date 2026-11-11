import Link from "next/link";
import { MynaBot } from "@/components/mascot/MynaBot";
import type { LessonSummary } from "@/lib/learn/score";

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
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <MynaBot mood={summary.stars === 3 ? "perfect" : summary.stars >= 1 ? "happy" : "wink"} className="h-32 w-32" />
      <div className="flex gap-2 text-6xl" role="img" aria-label={`${summary.stars} of 3 stars`}>
        {[1, 2, 3].map((n) => (
          <span key={n} className={n <= summary.stars ? "text-primary" : "text-line"} aria-hidden>
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
          <dd className="text-3xl font-black tabular-nums text-accent">{summary.score}%</dd>
        </div>
        <div className="card p-3">
          <dt className="text-xs font-extrabold uppercase tracking-wide text-muted">
            XP<span className="thai block normal-case">XP</span>
          </dt>
          <dd className="text-3xl font-black tabular-nums text-warn">+{summary.xp}</dd>
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

      <div className="flex w-full flex-col gap-3">
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

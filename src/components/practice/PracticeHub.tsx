"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { Bi, useLang } from "@/components/home/lang";
import { TopBar } from "@/components/home/TopBar";
import { useProgress } from "@/components/home/useProgress";
import { unitColor } from "@/components/home/PathMap";
import { StarIcon } from "@/components/home/icons";
import { MynaBot } from "@/components/mascot/MynaBot";
import { allSentences } from "@/lib/learn/content";
import { dayKey } from "@/lib/progress/store";
import { COURSES, courseStat, courseStatus, daysSince, type CourseId, type CourseStat, type PracticeCourse } from "@/lib/practice/courses";

const STATUS = {
  new: { en: "New", th: "ใหม่", cls: "bg-accent-soft text-accent" },
  "needs-work": { en: "Needs work", th: "ควรฝึกเพิ่ม", cls: "bg-warn-soft text-warn" },
  good: { en: "Good", th: "ดี", cls: "bg-good-soft text-good" },
  mastered: { en: "Mastered", th: "เชี่ยวชาญ", cls: "bg-good text-white" },
} as const;

const GROUPS: { title: { en: string; th: string }; ids: CourseId[] }[] = [
  { title: { en: "Draw the tune", th: "วาดเส้นทำนอง" }, ids: ["falling", "rising", "nonfinal"] },
  { title: { en: "Mixed patterns", th: "รูปแบบผสม" }, ids: ["lists", "tags"] },
  { title: { en: "From class", th: "จากในห้องเรียน" }, ids: ["class2"] },
  { title: { en: "Quick quiz", th: "ควิซเร็ว" }, ids: ["random"] },
];

/** The drill's seed: changes after each finished drill (it comes from the saved time), so the next one has fresh sentences. */
function seedFor(stat: CourseStat): number {
  const t = stat.lastAt ? Date.parse(stat.lastAt) : NaN;
  return Number.isFinite(t) ? (t % 9973) + 2 : 1;
}

const today = () => dayKey();

/**
 * Practice: a course select. Pick what to drill, from the three drawing patterns to a random quiz. The map teaches a pattern
 * for the first time; this is where it gets practised until it sticks. Each card shows how that pattern is going.
 */
export function PracticeHub() {
  const { progress, streak } = useProgress();
  const lang = useLang();
  const all = useMemo(() => allSentences(), []);
  const day = useSyncExternalStore(
    () => () => {},
    today,
    () => null,
  );
  const now = useMemo(() => {
    if (!day) return null;
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [day]);

  const stats = useMemo(() => Object.fromEntries(COURSES.map((c) => [c.id, courseStat(c.id, all, progress.lessons)])) as Record<CourseId, CourseStat>, [all, progress.lessons]);

  // Recommended: the practised pattern that is going worst, else the first one not tried yet
  const pick = useMemo(() => {
    const practiced = COURSES.filter((c) => c.id !== "random" && stats[c.id].best !== null).sort((a, b) => (stats[a.id].best ?? 0) - (stats[b.id].best ?? 0));
    const worst = practiced[0];
    if (worst && (stats[worst.id].best ?? 100) < 90) return { course: worst, reason: "weak" as const };
    const fresh = COURSES.find((c) => c.id !== "random" && stats[c.id].best === null);
    return fresh ? { course: fresh, reason: "new" as const } : { course: COURSES.find((c) => c.id === "random")!, reason: "mix" as const };
  }, [stats]);

  const when = (stat: CourseStat) => {
    const d = now ? daysSince(stat.lastAt, now) : null;
    if (d === null) return null;
    if (lang === "th") return d === 0 ? "ฝึกวันนี้" : `ฝึกเมื่อ ${d} วันก่อน`;
    return d === 0 ? "Practised today" : d === 1 ? "Practised yesterday" : `Practised ${d} days ago`;
  };

  const card = (c: PracticeCourse, featured = false) => {
    const stat = stats[c.id];
    const status = STATUS[courseStatus(stat)];
    const last = when(stat);
    return (
      <Link
        key={c.id}
        href={`/practice/${c.id}?s=${seedFor(stat)}`}
        style={unitColor(c.color)}
        className={`group flex items-center gap-4 rounded-3xl border-2 border-b-[6px] border-line bg-card p-4 transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:border-b-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${featured ? "border-[var(--u)]" : ""}`}
      >
        <span className="stop shrink-0 text-center" aria-hidden style={{ width: 64, height: 60 }}>
          <span className="ipa text-sm font-black leading-tight">{c.badge}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-black leading-tight">
            <Bi text={c.title} />
          </span>
          <span className="mt-1 block text-sm font-semibold text-muted">
            <Bi text={c.blurb} subClassName="hidden" />
          </span>
          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${status.cls}`}>{lang === "th" ? status.th : status.en}</span>
            {stat.best !== null && (
              <span className="flex items-center gap-1 text-sm font-extrabold">
                <span className="flex gap-0.5 text-[var(--u2)]" aria-label={`${stat.stars} / 3`}>
                  {[1, 2, 3].map((n) => (
                    <StarIcon key={n} filled={n <= stat.stars} className="size-3.5" />
                  ))}
                </span>
                {stat.best}%
              </span>
            )}
            <span className="text-xs font-bold text-muted">
              {lang === "th" ? `${stat.size} ประโยค` : `${stat.size} sentences`}
              {last ? ` · ${last}` : ""}
            </span>
          </span>
        </span>
        <span aria-hidden className="text-2xl font-black text-muted transition-transform group-hover:translate-x-0.5">
          ›
        </span>
      </Link>
    );
  };

  const recommendedText =
    pick.reason === "weak"
      ? { en: "Let's work on this one", th: "มาฝึกอันนี้กัน" }
      : pick.reason === "new"
        ? { en: "Try this next", th: "ลองอันนี้ต่อไป" }
        : { en: "You've tried them all. Mix it up!", th: "ลองครบแล้ว มาสุ่มกันเลย!" };

  return (
    <>
      <TopBar progress={progress} streak={streak} />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 pb-6 pt-4">
        <div className="flex items-center gap-3">
          <MynaBot mood="wink" className="size-16 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-3xl font-black tracking-tight">
              <Bi text={{ en: "Practice", th: "ฝึกฝน" }} />
            </h1>
            <p className="text-sm font-semibold text-muted">
              <Bi text={{ en: "The map teaches a tune. Here you make it stick.", th: "แผนที่สอนทำนอง ที่นี่ฝึกให้แม่น" }} subClassName="hidden" />
            </p>
          </div>
        </div>

        <section aria-label={lang === "th" ? "แนะนำสำหรับคุณ" : "Recommended"} className="flex flex-col gap-2">
          <h2 className="text-sm font-black uppercase tracking-wider text-muted">
            <Bi text={recommendedText} />
          </h2>
          {card(pick.course, true)}
        </section>

        {GROUPS.map((g) => (
          <section key={g.title.en} className="flex flex-col gap-3">
            <h2 className="text-sm font-black uppercase tracking-wider text-muted">
              <Bi text={g.title} />
            </h2>
            {g.ids.map((id) => card(COURSES.find((c) => c.id === id)!))}
          </section>
        ))}

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-black uppercase tracking-wider text-muted">
            <Bi text={{ en: "Sounds", th: "เสียง" }} />
          </h2>
          <Link
            href="/ipa"
            style={unitColor(3)}
            className="group flex items-center gap-4 rounded-3xl border-2 border-b-[6px] border-line bg-card p-4 transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:border-b-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="stop shrink-0" aria-hidden style={{ width: 64, height: 60 }}>
              <span className="ipa text-2xl font-black">/θ/</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-black leading-tight">
                <Bi text={{ en: "IPA writing", th: "ถอดเสียง IPA" }} />
              </span>
              <span className="mt-1 block text-sm font-semibold text-muted">
                <Bi text={{ en: "Hear a word, build or write its IPA.", th: "ฟังคำศัพท์ แล้วเรียงหรือเขียน IPA" }} subClassName="hidden" />
              </span>
            </span>
            <span aria-hidden className="text-2xl font-black text-muted transition-transform group-hover:translate-x-0.5">
              ›
            </span>
          </Link>
        </section>
      </main>
    </>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { Bi, useLang } from "@/components/home/lang";
import { TopBar } from "@/components/home/TopBar";
import { unitColor } from "@/components/home/PathMap";
import { useProgress } from "@/components/home/useProgress";
import { MynaBot } from "@/components/mascot/MynaBot";
import { allSentences } from "@/lib/learn/content";
import { SPEAK_GROUPS, SPEAK_TOPICS, pickSurprise, topicById, topicStat, type SpeakTopic } from "@/lib/speak/topics";

/**
 * Speak: choose what to say. Topics are cards grouped by tune (the pattern is the big badge), each with how many sentences
 * you have spoken. "Surprise me" picks a sentence you haven't said yet, or your weakest one.
 */
export function SpeakHub() {
  const { progress, streak } = useProgress();
  const router = useRouter();
  const lang = useLang();
  const all = useMemo(() => allSentences(), []);

  const surprise = () => {
    // chosen on the tap, so the random number never runs while the page renders
    const s = pickSurprise(all, progress.lessons, Math.floor(Math.random() * 1_000_000));
    if (!s) return;
    const topic = SPEAK_TOPICS.find((t) => t.id !== "class2" && t.matches(s));
    if (topic) router.push(`/lab/${topic.id}/${s.id}`);
  };

  const card = (t: SpeakTopic) => {
    const stat = topicStat(t, all, progress.lessons);
    const pct = stat.count ? Math.round((stat.done / stat.count) * 100) : 0;
    return (
      <Link
        key={t.id}
        href={`/lab/${t.id}`}
        style={unitColor(t.color)}
        className="group flex flex-col gap-3 rounded-3xl border-2 border-b-[6px] border-line bg-card p-4 transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:border-b-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span className="stop" aria-hidden style={{ width: 64, height: 60 }}>
          <span className="ipa px-1 text-center text-[0.8rem] font-black leading-tight">{t.badge}</span>
        </span>
        <span className="block min-h-[2.6rem] text-base font-black leading-tight">
          <Bi text={t.title} subClassName="hidden" />
        </span>
        <span className="flex flex-col gap-1.5">
          <span className="h-2.5 overflow-hidden rounded-full bg-line" aria-hidden>
            <span className="block h-full rounded-full bg-[var(--u)]" style={{ width: `${pct}%` }} />
          </span>
          <span className="text-xs font-bold text-muted">
            {lang === "th" ? `พูดแล้ว ${stat.done}/${stat.count}` : `${stat.done}/${stat.count} spoken`}
            {stat.avg !== null && <span className="text-ink"> · {stat.avg}%</span>}
          </span>
        </span>
      </Link>
    );
  };

  return (
    <>
      <TopBar progress={progress} streak={streak} />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 pb-6 pt-4">
        <div className="flex items-center gap-3">
          <MynaBot mood="listening" className="size-16 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-3xl font-black tracking-tight">
              <Bi text={{ en: "Speak", th: "ฝึกพูด" }} />
            </h1>
            <p className="text-sm font-semibold text-muted">
              <Bi text={{ en: "Say a sentence and see your tune next to the target.", th: "พูดประโยคแล้วดูทำนองของคุณเทียบกับแบบ" }} subClassName="hidden" />
            </p>
          </div>
        </div>

        <button type="button" onClick={surprise} className="btn btn-accent w-full gap-3 py-4 text-lg">
          <span aria-hidden className="text-2xl">
            🎲
          </span>
          <Bi text={{ en: "SURPRISE ME", th: "สุ่มให้ฉัน" }} className="items-start leading-tight" subClassName="text-white/80" />
        </button>

        {SPEAK_GROUPS.map((g) => (
          <section key={g.title.en} className="flex flex-col gap-3">
            <h2 className="text-sm font-black uppercase tracking-wider text-muted">
              <Bi text={g.title} />
            </h2>
            <div className="grid grid-cols-2 gap-3">{g.ids.map((id) => card(topicById(id)!))}</div>
          </section>
        ))}
      </main>
    </>
  );
}

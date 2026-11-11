"use client";

import { Bi } from "@/components/home/lang";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MynaBot, type BotMood } from "@/components/mascot/MynaBot";
import { analyze } from "@/lib/intonation/engine";
import type { Sentence } from "@/lib/intonation/types";
import type { DrawExercise } from "@/lib/learn/exercises";
import { tagReadingOf } from "@/lib/learn/meaning";
import { graded } from "@/lib/learn/score";
import {
  drawGroupsOf,
  drawScore,
  evaluateDrawing,
  levelsToContour,
  PATTERN_INFO,
  type DrawVerdict,
  type Levels,
} from "@/lib/learn/tuneDraw";
import { useAiEnabled } from "@/components/ai/useAiEnabled";
import { AskMyna } from "./AskMyna";
import { ListenButton } from "./ListenButton";
import { SpeakerButton } from "./ui";
import { TuneCanvas, type PenEvent } from "./TuneCanvas";
import type { ExerciseApi } from "./types";

/** What to draw, in words: the pattern of the sentence's groups, and (for several groups) where to lift the pen. */
function instructions(sentence: Sentence): { en: string; th: string } {
  const reading = tagReadingOf(sentence);
  if (reading === "sure")
    return {
      en: "Draw the statement first: level 2, rise to 3 on the stressed syllable of the last important word, fall to 1. Lift your pen at the |. Then the tag starts HIGH (3) and falls to 1.",
      th: "วาดประโยคแรกก่อน: เริ่มระดับ 2 ขึ้นไประดับ 3 ที่พยางค์เน้นของคำสำคัญคำสุดท้าย แล้วลงระดับ 1 ยกปากกาตรง | จากนั้น tag เริ่มสูง (ระดับ 3) แล้วลงระดับ 1",
    };
  if (reading === "unsure")
    return {
      en: "Draw the statement first: level 2, rise to 3 on the stressed syllable of the last important word, fall to 1. Lift your pen at the |. Then the tag starts at 2, rises to 3 and stays up.",
      th: "วาดประโยคแรกก่อน: เริ่มระดับ 2 ขึ้นไประดับ 3 ที่พยางค์เน้นของคำสำคัญคำสุดท้าย แล้วลงระดับ 1 ยกปากกาตรง | จากนั้น tag เริ่มที่ระดับ 2 ขึ้นไประดับ 3 แล้วค้างไว้",
    };
  return sentence.groups.length > 1
    ? {
        en: "Draw the tune of each thought group over the words with your Pencil or finger. Lift your pen at each |.",
        th: "วาดทำนองของแต่ละกลุ่มคำลงบนประโยคด้วยปากกาหรือนิ้ว ยกปากกาตรงเครื่องหมาย | แต่ละอัน",
      }
    : {
        en: "Draw the intonation line over the words with your Pencil or finger.",
        th: "วาดเส้นทำนองเสียงลงบนประโยคด้วยปากกาหรือนิ้ว",
      };
}

const TITLE = {
  perfect: { en: "Perfect!", th: "สมบูรณ์แบบ!" },
  good: { en: "Good!", th: "ดีมาก!" },
  miss: { en: "Not quite", th: "ยังไม่ใช่" },
};

/** Draw it: draw the tune on the sentence itself; the course rules grade every thought group. */
export function DrawIt({
  exercise,
  sentence,
  locked,
  api,
}: {
  exercise: DrawExercise;
  sentence: Sentence;
  locked: boolean;
  api: ExerciseApi;
}) {
  const groups = useMemo(() => drawGroupsOf(sentence), [sentence]);
  const total = useMemo(() => groups.reduce((n, g) => n + g.syl.length, 0), [groups]);
  const [verdict, setVerdict] = useState<DrawVerdict | null>(null);
  const [checkedLevels, setCheckedLevels] = useState<(Levels | null)[]>([]);
  const askOn = useAiEnabled("/api/ask-myna");
  const [mood, setMood] = useState<BotMood>("idle");
  const [look, setLook] = useState<{ x: number; y: number } | null>(null);
  const [details, setDetails] = useState<false | "top" | "ask">(false);
  const moodTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const how = instructions(sentence);
  const { setCheck } = api;

  const onChange = useCallback(
    (assigned: (Levels | null)[]) => {
      const filled = assigned.filter(Boolean).length;
      if (filled < Math.ceil(total * 0.8)) return setCheck(null);
      setCheck(() => {
        const v = evaluateDrawing(groups, assigned);
        setVerdict(v);
        setCheckedLevels(assigned);
        const passed = v.grade !== "miss";
        const detail = v.grade === "miss" ? v.failure!.message : v.grade === "good" ? v.diff! : sentence.note;
        const analysis = analyze(sentence, levelsToContour(sentence, assigned), { modality: "draw", timingKnown: true });
        return {
          outcome: graded(exercise.id, "draw", drawScore(v), passed),
          feedback: { passed, title: TITLE[v.grade], detail: { en: detail.en, th: detail.th } },
          analysis,
          grade: v.grade,
        };
      });
    },
    [exercise.id, groups, sentence, setCheck, total],
  );

  const onPen = useCallback((e: PenEvent) => {
    clearTimeout(moodTimer.current);
    if (e.kind === "start") setMood("watch");
    else if (e.kind === "move") setLook({ x: Math.max(-7, Math.min(7, (e.fx - 0.5) * 14)), y: Math.max(-5, Math.min(7, 3 + e.fy * 4)) });
    else {
      setMood(e.used ? "wink" : "idle");
      if (e.used) moodTimer.current = setTimeout(() => setMood("idle"), 900);
    }
  }, []);
  useEffect(() => () => clearTimeout(moodTimer.current), []);

  const shown = locked ? verdict : null;
  const coachMood: BotMood = shown ? "watch" : mood;
  const coachLook = shown ? { x: 0, y: 8 } : look;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <MynaBot mood={coachMood} look={coachLook} className="h-14 w-14 sm:h-16 sm:w-16" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.6rem] font-black leading-tight sm:text-3xl">
            <Bi text={{ en: "Draw the tune", th: "วาดเส้นทำนองเสียง" }} subClassName="mt-1 text-[0.62em]" />
          </h1>
          <span className="mt-1 inline-block rounded-full bg-line px-2.5 py-0.5 text-xs font-extrabold text-muted">
            {sentence.kind} · {[...new Set(sentence.groups.map((g) => g.pattern))].join(" | ")}
          </span>
        </div>
        <SpeakerButton sentence={sentence} size="md" />
      </div>

      <TuneCanvas
        groups={groups}
        locked={locked}
        marks={{
          reveal: !!shown,
          wrong: shown?.failure?.at ?? null,
          good: shown ? (shown.grade === "miss" ? shown.nuclei.filter((i) => i !== shown.failure?.at) : shown.nuclei) : [],
          near: shown?.grade === "good" ? (shown.diff?.i ?? null) : null,
        }}
        onChange={onChange}
        onPen={onPen}
      />

      {!locked && (
        <p className="text-center text-sm font-semibold text-muted">
          {how.en}
          <span className="thai block">{how.th}</span>
        </p>
      )}

      {shown && (
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className="btn px-4 py-2" onClick={() => setDetails("top")}>
            ☰ Answer details <span className="thai text-sm font-semibold">ดูเหตุผลของคำตอบ</span>
          </button>
          {askOn && (
            <button type="button" className="btn border-accent px-4 py-2 text-accent" onClick={() => setDetails("ask")}>
              💬 Ask Melobi <span className="thai text-sm font-semibold">ถาม Melobi</span>
            </button>
          )}
        </div>
      )}

      {shown && details && (
        <AnswerDetails
          verdict={shown}
          sentence={sentence}
          focusAsk={details === "ask"}
          ask={askOn ? <AskMyna sentence={sentence} assigned={checkedLevels} grade={shown.grade} /> : null}
          onClose={() => setDetails(false)}
        />
      )}
    </div>
  );
}

/** Every rule of every thought group: why it passed, or where the line went wrong. A bottom sheet over the lesson. */
function AnswerDetails({
  verdict,
  sentence,
  focusAsk,
  ask,
  onClose,
}: {
  verdict: DrawVerdict;
  sentence: Sentence;
  focusAsk: boolean;
  ask: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
    if (focusAsk) requestAnimationFrame(() => d?.querySelector("#ask-myna")?.scrollIntoView({ block: "start" }));
  }, [focusAsk]);
  const multi = verdict.reports.length > 1;
  const head =
    verdict.grade === "miss"
      ? { en: "Here's what's right and where your line went wrong.", th: "นี่คือส่วนที่ถูก และจุดที่เส้นของคุณผิด" }
      : verdict.grade === "perfect"
        ? { en: "Perfect! Your line matches the book on every syllable. Here's why each rule works.", th: "สมบูรณ์แบบ! เส้นของคุณตรงกับหนังสือทุกพยางค์ นี่คือเหตุผลของแต่ละข้อ" }
        : { en: `Good: every rule passes. ${verdict.diff?.en ?? ""}`, th: `ดี: ผ่านทุกข้อ ${verdict.diff?.th ?? ""}` };
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      aria-labelledby="dz-title"
      className="m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-hidden rounded-t-3xl bg-card p-0 text-ink backdrop:bg-black/50 sm:mx-auto sm:max-w-2xl"
    >
      <div className="max-h-[88dvh] overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
        <div className="mx-auto mb-2 mt-1 h-1.5 w-11 rounded-full bg-line" aria-hidden />
        <div className="flex items-start justify-between gap-3">
          <h2 id="dz-title" className="text-2xl font-black">
            Answer details<span className="thai block text-sm font-semibold text-muted">คำอธิบายคำตอบ</span>
          </h2>
          <button type="button" className="flex h-11 w-11 items-center justify-center rounded-xl text-xl font-black text-muted hover:bg-line" aria-label="Close" onClick={() => ref.current?.close()}>
            ✕
          </button>
        </div>
        <p className={`mt-2 text-lg font-extrabold ${verdict.grade === "miss" ? "text-bad" : "text-good"}`}>
          {head.en}
          <span className="thai block text-sm font-semibold text-muted">{head.th}</span>
        </p>
        <div className="my-3 rounded-2xl bg-bg p-3 font-bold leading-snug">
          <b className="block text-xs uppercase tracking-wider text-muted">The rule · หลักการ</b>
          {sentence.note.en}
          <span className="thai block text-sm font-semibold text-muted">{sentence.note.th}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <ListenButton sentence={sentence} label={{ en: "Hear the tune", th: "ฟังทำนองที่ถูก" }} className="btn btn-accent" />
        </div>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-extrabold text-muted">
          <span>
            <i className="mr-1.5 inline-block h-1.5 w-5 rounded bg-good align-middle" />
            Correct · ที่ถูก
          </span>
          <span>
            <i className="mr-1.5 inline-block h-1.5 w-5 rounded align-middle" style={{ background: "var(--pen)" }} />
            Yours · ของคุณ
          </span>
        </p>
        {verdict.reports.map((rep, gi) => (
          <section key={gi} className="mt-3 rounded-2xl border-2 border-line p-4">
            <h3 className="text-lg font-black">
              {multi ? `Part ${gi + 1}` : "The sentence"} <span className="font-extrabold text-muted">· {rep.group.pattern}</span>
            </h3>
            <p className="font-bold">
              {PATTERN_INFO[rep.group.pattern].en}
              <span className="thai block text-sm font-semibold text-muted">{PATTERN_INFO[rep.group.pattern].th}</span>
            </p>
            <ul className="mt-3 grid gap-3">
              {rep.checks
                .slice()
                .sort((a, b) => a.ord - b.ord)
                .map((c) => (
                  <li key={c.id} className="grid grid-cols-[28px_1fr] items-start gap-2.5">
                    <span className={`grid h-7 w-7 place-items-center rounded-full text-sm font-black ${c.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`} aria-label={c.ok ? "passed" : "not yet"}>
                      {c.ok ? "✓" : "✕"}
                    </span>
                    <div>
                      <b className={`block font-black ${c.ok ? "" : "text-bad"}`}>
                        {c.rule.en} <span className="thai font-bold text-muted">· {c.rule.th}</span>
                      </b>
                      <p className="mt-0.5 font-semibold leading-snug">{c.message.en}</p>
                      <p className="thai text-sm text-muted">{c.message.th}</p>
                    </div>
                  </li>
                ))}
              {!rep.complete && (
                <li className="grid grid-cols-[28px_1fr] items-start gap-2.5">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-line text-sm font-black text-muted">–</span>
                  <div>
                    <b className="block font-black">Other rules</b>
                    <p className="font-semibold">Checked once the whole part is drawn.</p>
                    <p className="thai text-sm text-muted">จะตรวจข้ออื่นเมื่อวาดครบทั้งส่วนแล้ว</p>
                  </div>
                </li>
              )}
            </ul>
          </section>
        ))}
        {ask}
        <div className="mt-4 flex justify-center">
          <button type="button" className="btn btn-primary min-w-56 py-3" onClick={() => ref.current?.close()}>
            Got it <span className="thai text-sm font-semibold">เข้าใจแล้ว</span>
          </button>
        </div>
      </div>
    </dialog>
  );
}

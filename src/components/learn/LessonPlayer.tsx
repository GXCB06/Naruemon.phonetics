"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { recordExerciseAttempt } from "@/lib/attempts";
import type { LessonContent } from "@/lib/learn/content";
import { buildExercises, listeningFallback, type Exercise } from "@/lib/learn/exercises";
import { summarize, type ExerciseOutcome, type LessonSummary } from "@/lib/learn/score";
import { completeLesson, loadProgress, saveProgress } from "@/lib/progress/store";
import { MynaBot, type BotMood } from "@/components/mascot/MynaBot";
import { Bi } from "@/components/home/lang";
import { playComplete, playResult, setSfxEnabled, sfxEnabled, subscribeSfx } from "./chime";
import { DrawIt } from "./DrawIt";
import { FindPeak } from "./FindPeak";
import { HearIt } from "./HearIt";
import { LessonComplete } from "./LessonComplete";
import { BuildTune } from "./BuildTune";
import { MatchPairs } from "./MatchPairs";
import { MeaningMatch } from "./MeaningMatch";
import { WhyButton } from "./WhyButton";
import { ShadowIt } from "./ShadowIt";
import type { Checked, ExerciseApi } from "./types";

type Phase = "answering" | "feedback";

/** The bot's face on the result sheet: star eyes for a Perfect drawing, a big jump at combo milestones, sad when wrong. */
function sheetMood(checked: Checked, combo: number): BotMood {
  if (!checked.feedback.passed) return "sad";
  if (checked.grade === "perfect") return "perfect";
  return combo === 3 || combo === 5 || (combo > 5 && combo % 5 === 0) ? "surprised" : "happy";
}

/** How each exercise is saved as an attempt: listening ones as "hear", reading ones as "peak". */
const ATTEMPT_KIND = { hear: "hear", meaning: "hear", match: "hear", peak: "peak", build: "peak", draw: "draw", shadow: "shadow" } as const;

const NO_MIC_NOTICE = {
  en: "No microphone, no problem. Here's a listening exercise instead.",
  th: "ไม่มีไมค์ก็ไม่เป็นไร ทำแบบฝึกหัดฟังแทนนะ",
};

/**
 * The lesson player: a progress bar, one exercise at a time, a big CHECK button and a bottom feedback sheet.
 * Finishing records XP, stars and the streak in localStorage (src/lib/progress/store.ts).
 */
export function LessonPlayer({
  unitId,
  lesson,
  nextLessonId,
  presetExercises,
  backHref = "/",
  backLabel,
  nextHref,
  nextLabel,
}: {
  unitId: string;
  lesson: LessonContent;
  nextLessonId: string | null;
  /** A ready-made list of exercises (a Practice drill) instead of the lesson's standard ones. */
  presetExercises?: Exercise[];
  /** Where "end lesson" and "back" go (the path by default; a drill goes back to the Practice hub). */
  backHref?: string;
  backLabel?: { en: string; th: string };
  /** The big button on the result screen, when it is not "next lesson". */
  nextHref?: string | null;
  nextLabel?: { en: string; th: string };
}) {
  const sentences = useMemo(() => new Map(lesson.sentences.map((s) => [s.id, s])), [lesson]);
  const [exercises, setExercises] = useState<Exercise[]>(() => presetExercises ?? buildExercises(lesson.sentences, lesson.id));
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>("answering");
  const [check, setCheckFn] = useState<(() => Checked | null) | null>(null);
  const [checked, setChecked] = useState<Checked | null>(null);
  const [outcomes, setOutcomes] = useState<ExerciseOutcome[]>([]);
  const [swapped, setSwapped] = useState<Set<string>>(new Set());
  const [leaving, setLeaving] = useState(false);
  const [done, setDone] = useState<{ summary: LessonSummary; streak: number; bestCombo: number } | null>(null);
  // correct answers in a row (a wrong answer resets it); `comboKey` restarts the pop animation
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [lostCombo, setLostCombo] = useState(0);
  const sound = useSyncExternalStore(subscribeSfx, sfxEnabled, () => true);

  // A function in state has to be wrapped, or React would call it as an updater.
  const api = useMemo<ExerciseApi>(() => ({ setCheck: (fn) => setCheckFn(fn ? () => fn : null) }), []);

  const exercise = exercises[index];
  const sentence = sentences.get(exercise.sentenceId)!;
  const locked = phase === "feedback";

  const onCheck = () => {
    const result = check?.();
    if (!result) return;
    recordExerciseAttempt(sentence, ATTEMPT_KIND[exercise.type], { passed: result.outcome.passed, analysis: result.analysis, grade: result.grade }); // C5/D2: never throws
    const ok = result.feedback.passed;
    const nextCombo = ok ? combo + 1 : 0;
    setLostCombo(ok ? 0 : combo);
    setCombo(nextCombo);
    setBestCombo((b) => Math.max(b, nextCombo));
    playResult(ok, { combo: nextCombo, perfect: result.grade === "perfect" });
    setChecked(result);
    setPhase("feedback");
  };

  const next = () => {
    if (!checked) return;
    const all = [...outcomes, checked.outcome];
    setOutcomes(all);
    if (index + 1 < exercises.length) {
      setIndex(index + 1);
      setAttempt(0);
      setPhase("answering");
      setCheckFn(null);
      setChecked(null);
      return;
    }
    playComplete(); // inside the FINISH tap (iPad)
    const summary = summarize(all);
    const progress = completeLesson(loadProgress(), lesson.id, { score: summary.score, xp: summary.xp });
    saveProgress(progress);
    setDone({ summary, streak: progress.streak, bestCombo });
  };

  const tryAgain = () => {
    setAttempt((a) => a + 1);
    setPhase("answering");
    setCheckFn(null);
    setChecked(null);
  };

  const skipMic = useCallback(() => {
    if (exercise.type !== "shadow") return;
    const swap = listeningFallback(exercise, sentence);
    setExercises((list) => list.map((e, i) => (i === index ? swap : e)));
    setSwapped((s) => new Set(s).add(swap.id));
    setAttempt(0);
    setCheckFn(null);
  }, [exercise, sentence, index]);

  // Enter = CHECK, then CONTINUE (not while typing, and not when a button already has focus: it clicks itself)
  const keyRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    keyRef.current = () => (phase === "answering" ? (check ? onCheck() : undefined) : next());
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "BUTTON" || t.tagName === "A" || t.isContentEditable)) return;
      if (document.querySelector('[role="dialog"],[role="alertdialog"]')) return;
      e.preventDefault();
      keyRef.current();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  if (done) {
    return (
      <LessonComplete
        summary={done.summary}
        streak={done.streak}
        bestCombo={done.bestCombo}
        nextHref={nextHref !== undefined ? nextHref : nextLessonId ? `/learn/${unitId}/${nextLessonId}` : null}
        nextLabel={nextLabel}
        backHref={backHref}
        backLabel={backLabel}
      />
    );
  }

  const key = `${exercise.id}-${attempt}`;
  const shown = index + (phase === "feedback" ? 1 : 0);
  const pct = Math.round((shown / exercises.length) * 100);
  const retryable = checked && !checked.feedback.passed && (exercise.type === "draw" || exercise.type === "shadow");
  const ok = checked?.feedback.passed ?? false;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
      <header className="sticky top-0 z-10 bg-bg px-4 pb-2 pt-5">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
          <button
            type="button"
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-line hover:text-ink"
            aria-label="Leave lesson · ออกจากบทเรียน"
            onClick={() => setLeaving(true)}
          >
            <svg viewBox="0 0 24 24" className="size-7" aria-hidden fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <div className="relative flex-1">
            {combo >= 2 && (
              <span key={combo} className="combo-pop absolute -top-5 left-1 whitespace-nowrap text-xs font-black uppercase tracking-wider text-warn">
                ⚡ {combo} in a row <span className="thai normal-case tracking-normal">ถูกติดกัน</span>
              </span>
            )}
            <div
              className="h-4 overflow-hidden rounded-full bg-line"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={exercises.length}
              aria-valuenow={shown}
              aria-label={`Lesson progress ${shown}/${exercises.length}`}
            >
              <div
                className={`relative h-full rounded-full transition-[width,background-color] duration-500 motion-reduce:transition-none ${combo >= 2 ? "bg-warn" : "bg-good"}`}
                style={{ width: `${Math.max(pct, 4)}%` }}
              >
                <span className="absolute inset-x-2 top-1 h-1 rounded-full bg-white/35" aria-hidden />
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-pressed={sound}
            aria-label="Sound effects · เสียงเอฟเฟกต์"
            title={sound ? "Sound effects on" : "Sound effects off"}
            onClick={() => setSfxEnabled(!sound)}
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-line hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="size-6" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
              {sound ? <path d="M16 9a4 4 0 0 1 0 6M18.8 6.5a7.5 7.5 0 0 1 0 11" /> : <path d="M16 9.5l5 5M21 9.5l-5 5" />}
            </svg>
          </button>
        </div>
      </header>

      {leaving && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/40 sm:items-center sm:justify-center" role="alertdialog" aria-label="Leave lesson?">
          <div className="sheet-up w-full rounded-t-3xl bg-card p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center sm:max-w-md sm:rounded-3xl">
            <MynaBot mood="sad" className="mx-auto size-20" />
            <p className="mt-3 text-xl font-black">
              <Bi text={{ en: "Wait, don't go! You'll lose this lesson's progress.", th: "เดี๋ยวก่อน! ถ้าออกตอนนี้ ความคืบหน้าในบทนี้จะหายไป" }} />
            </p>
            <div className="mt-5 flex flex-col gap-3">
              <button type="button" className="btn btn-accent w-full py-4 text-lg" onClick={() => setLeaving(false)} autoFocus>
                <Bi text={{ en: "KEEP LEARNING", th: "เรียนต่อ" }} className="items-center leading-tight" subClassName="text-white/80" />
              </button>
              <Link href={backHref} className="btn w-full border-transparent! bg-transparent! py-3 text-bad">
                <Bi text={{ en: "END LESSON", th: "ออกจากบทเรียน" }} className="items-center leading-tight" />
              </Link>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 px-4 pb-72 pt-4">
        {/* no scale-in on the drawing screen: the canvas measures itself and must not see a shrunk page */}
        <div key={key} className={`mx-auto w-full ${exercise.type === "draw" ? "max-w-3xl" : "pop-in max-w-2xl"}`}>
          {exercise.type === "hear" && (
            <HearIt
              exercise={exercise}
              sentence={sentence}
              locked={locked}
              api={api}
              notice={swapped.has(exercise.id) ? NO_MIC_NOTICE : undefined}
            />
          )}
          {exercise.type === "meaning" && <MeaningMatch exercise={exercise} sentence={sentence} locked={locked} api={api} />}
          {exercise.type === "match" && <MatchPairs exercise={exercise} sentence={sentence} locked={locked} api={api} />}
          {exercise.type === "build" && <BuildTune exercise={exercise} sentence={sentence} locked={locked} api={api} />}
          {exercise.type === "peak" && <FindPeak exercise={exercise} sentence={sentence} locked={locked} api={api} />}
          {exercise.type === "draw" && <DrawIt exercise={exercise} sentence={sentence} locked={locked} api={api} />}
          {exercise.type === "shadow" && (
            <ShadowIt exercise={exercise} sentence={sentence} locked={locked} api={api} onSkip={skipMic} />
          )}
        </div>
      </main>

      <footer
        className={`fixed inset-x-0 bottom-0 z-20 ${
          phase === "feedback" ? `sheet-up ${ok ? "bg-good-soft" : "bg-bad-soft"}` : "border-t-2 border-line bg-bg"
        }`}
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
          {phase === "feedback" && checked && (
            <div role="status" aria-live="polite" className={`flex items-start gap-3 ${ok ? "text-good" : "text-bad"}`}>
              <MynaBot mood={sheetMood(checked, combo)} className="-mt-1 size-14 shrink-0 sm:size-16" />
              <div className="min-w-0 flex-1">
                <div className="text-2xl font-black leading-tight">
                  {checked.grade === "perfect" && <span className="mr-2">Perfect!</span>}
                  <Bi text={checked.feedback.title} inline subClassName="text-[0.65em]" />
                </div>
                <div className="mt-1.5 font-bold text-ink">
                  <Bi text={checked.feedback.detail} subClassName="mt-0.5 text-[0.88em] font-semibold text-ink/70" />
                </div>
                {ok && combo >= 2 && (
                  <p className="mt-1 text-sm font-black text-warn">
                    ⚡ {combo} in a row <span className="thai font-semibold">ถูกติดกัน {combo} ข้อ</span>
                  </p>
                )}
                {!ok && lostCombo >= 2 && (
                  <p className="mt-1 text-sm font-black text-bad">
                    {lostCombo} in a row lost <span className="thai font-semibold">เสียคอมโบ {lostCombo}</span>
                  </p>
                )}
                {!ok && exercise.type !== "draw" && exercise.type !== "shadow" && <WhyButton sentence={sentence} exercise={exercise.type} />}
              </div>
            </div>
          )}
          {phase === "answering" ? (
            <button type="button" className="btn btn-primary btn-check w-full py-4 text-lg tracking-wide" onClick={onCheck} disabled={!check}>
              <Bi text={{ en: "CHECK", th: "ตรวจคำตอบ" }} className="items-center leading-tight" subClassName="text-current" />
            </button>
          ) : (
            <div className="flex gap-3">
              {retryable && (
                <button type="button" className="btn py-4 text-lg" onClick={tryAgain}>
                  <Bi text={{ en: "TRY AGAIN", th: "ลองใหม่" }} className="items-center leading-tight" />
                </button>
              )}
              <button type="button" className={`btn flex-1 py-4 text-lg tracking-wide ${ok ? "btn-good" : "btn-bad"}`} onClick={next} autoFocus>
                <Bi
                  text={index + 1 === exercises.length ? { en: "FINISH", th: "เสร็จสิ้น" } : ok ? { en: "CONTINUE", th: "ต่อไป" } : { en: "GOT IT", th: "เข้าใจแล้ว" }}
                  className="items-center leading-tight"
                  subClassName="text-white/80"
                />
              </button>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}

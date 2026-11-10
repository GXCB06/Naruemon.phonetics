"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { recordExerciseAttempt } from "@/lib/attempts";
import type { LessonContent } from "@/lib/learn/content";
import { buildExercises, listeningFallback, type Exercise } from "@/lib/learn/exercises";
import { summarize, type ExerciseOutcome, type LessonSummary } from "@/lib/learn/score";
import { completeLesson, loadProgress, saveProgress } from "@/lib/progress/store";
import { MynaBot, type BotMood } from "@/components/mascot/MynaBot";
import { playResult } from "./chime";
import { DrawIt } from "./DrawIt";
import { FindPeak } from "./FindPeak";
import { HearIt } from "./HearIt";
import { LessonComplete } from "./LessonComplete";
import { MeaningMatch } from "./MeaningMatch";
import { ShadowIt } from "./ShadowIt";
import type { Checked, ExerciseApi } from "./types";

type Phase = "answering" | "feedback";

/** The bot's face on the result sheet: star eyes for a Perfect drawing, a big jump at combo milestones, sad when wrong. */
function sheetMood(checked: Checked, combo: number): BotMood {
  if (!checked.feedback.passed) return "sad";
  if (checked.grade === "perfect") return "perfect";
  return combo === 3 || combo === 5 || (combo > 5 && combo % 5 === 0) ? "surprised" : "happy";
}

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
}: {
  unitId: string;
  lesson: LessonContent;
  nextLessonId: string | null;
}) {
  const sentences = useMemo(() => new Map(lesson.sentences.map((s) => [s.id, s])), [lesson]);
  const [exercises, setExercises] = useState<Exercise[]>(() => buildExercises(lesson.sentences, lesson.id));
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

  // A function in state has to be wrapped, or React would call it as an updater.
  const api = useMemo<ExerciseApi>(() => ({ setCheck: (fn) => setCheckFn(fn ? () => fn : null) }), []);

  const exercise = exercises[index];
  const sentence = sentences.get(exercise.sentenceId)!;
  const locked = phase === "feedback";

  const onCheck = () => {
    const result = check?.();
    if (!result) return;
    recordExerciseAttempt(sentence, exercise.type === "meaning" ? "hear" : exercise.type, { passed: result.outcome.passed, analysis: result.analysis, grade: result.grade }); // C5/D2: never throws
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

  if (done) {
    return (
      <LessonComplete
        summary={done.summary}
        streak={done.streak}
        bestCombo={done.bestCombo}
        nextHref={nextLessonId ? `/learn/${unitId}/${nextLessonId}` : null}
      />
    );
  }

  const key = `${exercise.id}-${attempt}`;
  const pct = Math.round(((index + (phase === "feedback" ? 1 : 0)) / exercises.length) * 100);
  const retryable = checked && !checked.feedback.passed && (exercise.type === "draw" || exercise.type === "shadow");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-bg px-4 py-3">
        <button
          type="button"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl font-black text-muted hover:bg-line"
          aria-label="Leave lesson"
          onClick={() => setLeaving(true)}
        >
          ✕
        </button>
        <div
          className="h-4 flex-1 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={exercises.length}
          aria-valuenow={index + (phase === "feedback" ? 1 : 0)}
          aria-label="Lesson progress"
        >
          <div className="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
        </div>
        <span
          key={combo}
          className={`combo-pop inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-black tabular-nums ${combo >= 2 ? "bg-good text-white" : "bg-line text-muted"}`}
          aria-label={`Combo ${combo}`}
          title="Correct answers in a row"
        >
          <span aria-hidden>⚡</span>×{combo}
        </span>
        <span className="w-10 shrink-0 text-right text-sm font-extrabold tabular-nums text-muted max-sm:hidden">
          {index + 1}/{exercises.length}
        </span>
      </header>

      {leaving && (
        <div className="mx-4 mb-2 rounded-2xl border-2 border-warn bg-warn-soft p-4" role="alertdialog" aria-label="Leave lesson?">
          <p className="font-extrabold text-warn">
            Leave this lesson? You&apos;ll lose your progress in it.
            <span className="thai block font-semibold">ออกจากบทเรียน? ความคืบหน้าในบทนี้จะหายไป</span>
          </p>
          <div className="mt-3 flex gap-3">
            <button type="button" className="btn btn-accent flex-1" onClick={() => setLeaving(false)}>
              Stay <span className="thai text-sm font-semibold">อยู่ต่อ</span>
            </button>
            <Link href="/" className="btn flex-1">
              Leave <span className="thai text-sm font-semibold">ออก</span>
            </Link>
          </div>
        </div>
      )}

      <main className="flex-1 px-4 pb-72 pt-2">
        <div key={key}>
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
          {exercise.type === "peak" && <FindPeak exercise={exercise} sentence={sentence} locked={locked} api={api} />}
          {exercise.type === "draw" && <DrawIt exercise={exercise} sentence={sentence} locked={locked} api={api} />}
          {exercise.type === "shadow" && (
            <ShadowIt exercise={exercise} sentence={sentence} locked={locked} api={api} onSkip={skipMic} />
          )}
        </div>
      </main>

      <footer
        className={`fixed inset-x-0 bottom-0 z-20 border-t-2 ${
          phase === "feedback" ? (checked?.feedback.passed ? "border-good bg-good-soft" : "border-warn bg-warn-soft") : "border-line bg-bg"
        }`}
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
          {phase === "feedback" && checked && (
            <div role="status" aria-live="polite" className={`flex items-start gap-3 ${checked.feedback.passed ? "text-good" : "text-warn"}`}>
              <MynaBot mood={sheetMood(checked, combo)} className="-mt-1 h-14 w-14 sm:h-16 sm:w-16" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 text-2xl font-black">
                  {checked.feedback.title.en}
                  <span className="thai text-xl font-bold">{checked.feedback.title.th}</span>
                </div>
                <p className="mt-1 font-semibold text-ink">{checked.feedback.detail.en}</p>
                <p className="thai text-sm text-ink/80">{checked.feedback.detail.th}</p>
                {checked.feedback.passed && combo >= 2 && (
                  <p className="mt-1 text-sm font-black">
                    Combo ×{combo} <span className="thai font-semibold text-muted">ถูกต่อเนื่อง {combo} ข้อ</span>
                  </p>
                )}
                {!checked.feedback.passed && lostCombo >= 2 && (
                  <p className="mt-1 text-sm font-black text-bad">
                    Combo ×{lostCombo} lost <span className="thai font-semibold text-muted">เสียคอมโบ</span>
                  </p>
                )}
              </div>
            </div>
          )}
          {phase === "answering" ? (
            <button type="button" className="btn btn-primary w-full py-4 text-lg" onClick={onCheck} disabled={!check}>
              CHECK <span className="thai text-base font-semibold">ตรวจคำตอบ</span>
            </button>
          ) : (
            <div className="flex gap-3">
              {retryable && (
                <button type="button" className="btn py-4 text-lg" onClick={tryAgain}>
                  Try again <span className="thai text-base font-semibold">ลองใหม่</span>
                </button>
              )}
              <button
                type="button"
                className={`btn flex-1 py-4 text-lg ${checked?.feedback.passed ? "btn-accent" : "btn-primary"}`}
                onClick={next}
                autoFocus
              >
                {index + 1 === exercises.length ? "FINISH" : "CONTINUE"}
                <span className="thai text-base font-semibold">{index + 1 === exercises.length ? "เสร็จสิ้น" : "ต่อไป"}</span>
              </button>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}

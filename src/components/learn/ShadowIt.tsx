"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ContourChart } from "@/components/lab/ContourChart";
import { Countdown } from "@/components/lab/Countdown";
import { KaraokeSentence } from "@/components/lab/KaraokeSentence";
import { analyzeVoice, type VoiceAnalysis } from "@/lib/audio/analyzeVoice";
import { MicError, MicRecorder } from "@/lib/audio/recorder";
import { layoutSentence, targetContour } from "@/lib/intonation/contour";
import type { Sentence } from "@/lib/intonation/types";
import type { ShadowExercise } from "@/lib/learn/exercises";
import { analysisFeedback } from "@/lib/learn/feedback";
import { graded } from "@/lib/learn/score";
import { ListenButton } from "./ListenButton";
import type { ExerciseApi } from "./types";

const MAX_SEC = 10;
const COUNTDOWN_FROM = 3;

type Phase = "idle" | "starting" | "countdown" | "recording" | "analyzing" | "done" | "error";

/**
 * Shadow it: listen to the sentence, then say it. Uses the same voice pipeline as the lab (MicRecorder → analyzeVoice →
 * rule engine). It never needs a microphone to get through the lesson: "Skip (no mic)" swaps in a listening exercise.
 */
export function ShadowIt({
  exercise,
  sentence,
  locked,
  api,
  onSkip,
}: {
  exercise: ShadowExercise;
  sentence: Sentence;
  locked: boolean;
  api: ExerciseApi;
  onSkip: () => void;
}) {
  const [heard, setHeard] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(COUNTDOWN_FROM);
  const [elapsed, setElapsed] = useState(0);
  const [analysis, setAnalysis] = useState<VoiceAnalysis | null>(null);
  const recRef = useRef<MicRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  /** Total samples received so far (countdown included). */
  const seenRef = useRef(0);
  /** Sample index where "Go" happened; null until the countdown ends. Earlier samples are discarded. */
  const goRef = useRef<number | null>(null);
  const stopRef = useRef<() => Promise<void>>(async () => undefined);
  const { setCheck } = api;

  const layout = useMemo(() => layoutSentence(sentence), [sentence]);
  const target = useMemo(() => targetContour(layout), [layout]);
  const playbackUrl = useMemo(
    () => (analysis ? URL.createObjectURL(new Blob([analysis.playback as BlobPart], { type: "audio/wav" })) : null),
    [analysis],
  );
  useEffect(() => () => void (playbackUrl && URL.revokeObjectURL(playbackUrl)), [playbackUrl]);

  // Leaving the exercise mid-take must release the microphone.
  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (countdownRef.current) window.clearInterval(countdownRef.current);
      const rec = recRef.current;
      recRef.current = null;
      void rec?.stop().catch(() => undefined);
    },
    [],
  );

  // CHECK becomes available once there is a result with a clear voice in it.
  const result = analysis?.result ?? null;
  useEffect(() => {
    if (!result) return setCheck(null);
    setCheck(() => {
      const feedback = analysisFeedback(result);
      return { outcome: graded(exercise.id, "shadow", result.overall, feedback.passed), feedback, analysis: result };
    });
  }, [result, exercise.id, setCheck]);

  const stop = async () => {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    const go = goRef.current ?? 0;
    goRef.current = null;
    const raw = await rec.stop();
    setPhase("analyzing");
    // let the UI paint "Analysing…" first
    setTimeout(() => {
      try {
        setAnalysis(analyzeVoice(raw.subarray(Math.min(go, raw.length)), rec.sampleRate, sentence));
        setPhase("done");
      } catch {
        setError("Something went wrong while analysing. Please try again.");
        setPhase("error");
      }
    }, 30);
  };
  useEffect(() => {
    stopRef.current = stop; // the recorder callback (created once, in start) calls the latest stop
  });

  const start = async () => {
    setError(null);
    setAnalysis(null);
    setElapsed(0);
    seenRef.current = 0;
    goRef.current = null;
    setPhase("starting");
    const rec = new MicRecorder();
    recRef.current = rec;
    try {
      // The mic starts during the countdown so it can settle; samples before "Go" are dropped.
      await rec.start({
        onChunk: (chunk, sr) => {
          seenRef.current += chunk.length;
          const go = goRef.current;
          if (go !== null && (seenRef.current - go) / sr >= MAX_SEC) void stopRef.current();
        },
      });
      if (recRef.current !== rec) {
        await rec.stop().catch(() => undefined); // cancelled while the browser asked for the mic
        return;
      }
      let n = COUNTDOWN_FROM;
      setCount(n);
      setPhase("countdown");
      countdownRef.current = window.setInterval(() => {
        n -= 1;
        if (n > 0) return setCount(n);
        if (countdownRef.current) window.clearInterval(countdownRef.current);
        countdownRef.current = null;
        goRef.current = seenRef.current;
        setPhase("recording");
        const t0 = performance.now();
        timerRef.current = window.setInterval(() => setElapsed((performance.now() - t0) / 1000), 100);
      }, 1000);
    } catch (e) {
      recRef.current = null;
      setPhase("error");
      setError(e instanceof MicError ? e.message : "Couldn't start the microphone.");
    }
  };

  const cancel = async () => {
    if (countdownRef.current) window.clearInterval(countdownRef.current);
    countdownRef.current = null;
    const rec = recRef.current;
    recRef.current = null;
    goRef.current = null;
    setPhase("idle");
    await rec?.stop().catch(() => undefined);
  };

  const busy = phase === "starting" || phase === "countdown" || phase === "recording" || phase === "analyzing";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-black leading-snug">
          Say it
          <span className="thai block text-lg font-bold text-muted">พูดตาม</span>
        </h1>
        <p className="mt-1 text-sm text-muted">
          First listen. Then tap the microphone and say the sentence once.
          <span className="thai block">ฟังก่อน แล้วกดไมค์และพูดประโยคนี้หนึ่งครั้ง</span>
        </p>
      </div>

      <div className="card flex flex-col gap-4 p-4">
        {phase === "countdown" || phase === "recording" ? (
          <KaraokeSentence sentence={sentence} elapsedSec={phase === "recording" ? elapsed : null} />
        ) : (
          <p className="text-2xl font-bold leading-snug">“{sentence.text}”</p>
        )}
        <ListenButton sentence={sentence} onPlay={() => setHeard(true)} />
      </div>

      {phase === "countdown" && <Countdown count={count} />}

      <div className="flex flex-wrap items-center gap-3">
        {phase === "countdown" ? (
          <button type="button" className="btn text-lg" onClick={() => void cancel()}>
            ✕ Cancel <span className="thai text-base">ยกเลิก</span>
          </button>
        ) : phase === "recording" ? (
          <button type="button" className="btn btn-danger text-lg" onClick={() => void stop()}>
            ■ Stop ({elapsed.toFixed(1)}s) <span className="thai text-base">หยุด</span>
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-accent text-lg"
            onClick={() => void start()}
            disabled={busy || locked || !heard}
          >
            🎙️ {phase === "done" || phase === "error" ? "Record again" : "Record"}
            <span className="thai text-base font-semibold">{phase === "done" || phase === "error" ? "อัดใหม่" : "อัดเสียง"}</span>
          </button>
        )}
        {!heard && phase === "idle" && (
          <span className="text-sm font-semibold text-muted">
            Listen first.<span className="thai ml-1">ฟังก่อนนะ</span>
          </span>
        )}
      </div>

      {phase === "analyzing" && <p className="font-bold text-muted">Analysing… <span className="thai">กำลังวิเคราะห์…</span></p>}

      {error && (
        <div className="rounded-xl bg-bad-soft p-3 font-semibold text-bad" role="alert">
          {error}
          <span className="thai block text-sm font-normal">
            ใช้ไมค์ไม่ได้ตอนนี้ ไม่เป็นไร กด “Skip (no mic)” เพื่อทำแบบฝึกหัดฟังแทน
          </span>
        </div>
      )}

      {phase === "done" && analysis && !analysis.result && (
        <p className="rounded-xl bg-warn-soft p-3 font-semibold text-warn" role="alert">
          I couldn&apos;t find a clear voice in that take. Speak a little louder and closer to the mic, then record again.
          <span className="thai block text-sm font-normal">ฟังเสียงไม่ชัด ลองพูดให้ดังขึ้นและใกล้ไมค์ขึ้น แล้วอัดใหม่</span>
        </p>
      )}

      {phase === "done" && analysis?.result && (
        <div className="flex flex-col gap-3">
          <div className="card overflow-hidden p-2">
            <ContourChart
              layout={layout}
              lines={[
                { contour: target, color: "var(--target)", dashed: true, width: 4 },
                { contour: analysis.result.aligned, color: "var(--learner)", width: 5 },
              ]}
              className="w-full"
            />
            <p className="px-2 pb-1 text-xs text-muted">
              <span className="font-black text-[var(--target)]">- - -</span> target &nbsp;
              <span className="font-black text-accent">——</span> you
            </p>
          </div>
          {playbackUrl && <audio controls src={playbackUrl} className="w-full" />}
          {analysis.quality.issues.slice(0, 1).map((q, i) => (
            <p
              key={i}
              className={`rounded-xl p-3 text-sm font-semibold ${q.level === "fail" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn"}`}
            >
              {q.en} <span className="thai block font-normal">{q.th}</span>
            </p>
          ))}
          <p className="text-sm text-muted">
            Tap CHECK to see how you did. <span className="thai">กด CHECK เพื่อดูผล</span>
          </p>
        </div>
      )}

      <div className="flex flex-col items-start gap-1 border-t-2 border-line pt-4">
        <button type="button" className="btn text-base" onClick={onSkip} disabled={locked || phase === "recording"}>
          Skip (no mic) <span className="thai text-sm font-semibold">ข้าม (ไม่มีไมค์)</span>
        </button>
        <span className="text-xs text-muted">
          Swaps this for a listening exercise instead.
          <span className="thai ml-1">จะเปลี่ยนเป็นแบบฝึกหัดฟังแทน</span>
        </span>
      </div>
    </div>
  );
}

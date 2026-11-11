"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ContourChart } from "@/components/lab/ContourChart";
import { MicCheckButton } from "@/components/mic/MicCheckButton";
import { MicGateDialog } from "@/components/mic/MicGateDialog";
import { loadMicProfile } from "@/components/mic/micProfile";
import { micGate, takeBlocksGrade, takeChips, type GateReason } from "@/lib/audio/micProfile";
import { KaraokeSentence } from "@/components/lab/KaraokeSentence";
import { analyzeVoice, type VoiceAnalysis } from "@/lib/audio/analyzeVoice";
import { MicError, MicRecorder } from "@/lib/audio/recorder";
import { layoutSentence, targetContour } from "@/lib/intonation/contour";
import type { Sentence } from "@/lib/intonation/types";
import type { ShadowExercise } from "@/lib/learn/exercises";
import { analysisFeedback } from "@/lib/learn/feedback";
import { graded } from "@/lib/learn/score";
import { Bi } from "@/components/home/lang";
import { MynaSays, Prompt, SpeakerButton } from "./ui";
import type { ExerciseApi } from "./types";

const MAX_SEC = 10;

type Phase = "idle" | "starting" | "recording" | "analyzing" | "done" | "error";

/**
 * Shadow it: listen to the sentence, then say it. Uses the same voice pipeline as the lab (MicRecorder → analyzeVoice →
 * rule engine). It never needs a microphone to get through the lesson: "Can't speak now" swaps in a listening exercise.
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
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [analysis, setAnalysis] = useState<VoiceAnalysis | null>(null);
  /** Set while the mic check dialog is open before speaking; the reason says why Myna is asking. */
  const [gate, setGate] = useState<GateReason | null>(null);
  /** The microphone in use is not the one that was checked (known once the mic is open). */
  const [micChanged, setMicChanged] = useState(false);
  const recRef = useRef<MicRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  /** Total samples received so far. */
  const seenRef = useRef(0);
  /** Sample index where recording started; null until the mic is open. */
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
      const rec = recRef.current;
      recRef.current = null;
      void rec?.stop().catch(() => undefined);
    },
    [],
  );

  // CHECK becomes available once there is a result with a clear voice in it.
  const result = analysis?.result ?? null;
  useEffect(() => {
    if (!result || (analysis && takeBlocksGrade(analysis.quality))) return setCheck(null); // a take too quiet to judge fairly gets no score
    setCheck(() => {
      const feedback = analysisFeedback(result);
      return { outcome: graded(exercise.id, "shadow", result.overall, feedback.passed), feedback, analysis: result };
    });
  }, [result, analysis, exercise.id, setCheck]);

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
      // No countdown: recording starts the moment the mic is open.
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
      setMicChanged(micGate(loadMicProfile(), rec.inputInfo.label, Date.now()).reason === "changed");
      goRef.current = seenRef.current;
      setPhase("recording");
      const t0 = performance.now();
      timerRef.current = window.setInterval(() => setElapsed((performance.now() - t0) / 1000), 100);
    } catch (e) {
      recRef.current = null;
      setPhase("error");
      setError(e instanceof MicError ? e.message : "Couldn't start the microphone.");
    }
  };

  const busy = phase === "starting" || phase === "recording" || phase === "analyzing";

  const again = phase === "done" || phase === "error";
  // First time on this device (or after a failed check): a short mic check before the first recording
  const speak = () => {
    const d = micGate(loadMicProfile(), null, Date.now());
    if (d.need && d.reason) setGate(d.reason);
    else void start();
  };

  return (
    <div className="flex flex-col gap-6">
      <Prompt
        title={{ en: "Say this sentence", th: "พูดประโยคนี้" }}
        tip={{
          en: "Tap the speaker to hear it first if you like. Tap the mic, say the sentence once, then tap again to stop.",
          th: "แตะลำโพงเพื่อฟังก่อนก็ได้ แตะไมค์ พูดประโยคหนึ่งครั้ง แล้วแตะอีกครั้งเพื่อหยุด",
        }}
      />

      <MynaSays mood={phase === "recording" ? "listening" : phase === "analyzing" ? "thinking" : "idle"}>
        <div className="flex items-center gap-3">
          <SpeakerButton sentence={sentence} size="md" />
          <div className="min-w-0 flex-1">
            {phase === "recording" ? (
              <KaraokeSentence sentence={sentence} elapsedSec={elapsed} />
            ) : (
              <p className="text-xl font-bold leading-snug sm:text-2xl">{sentence.text}</p>
            )}
          </div>
        </div>
      </MynaSays>

      {phase === "recording" ? (
        <button
          type="button"
          className="btn btn-bad w-full flex-col gap-1 py-5 text-lg"
          data-sfx="none"
          onClick={() => void stop()}
          aria-label={`Stop recording (${elapsed.toFixed(1)} seconds)`}
        >
          <span className="flex h-8 items-end gap-1" aria-hidden>
            {[0, 1, 2, 3, 4, 5, 6].map((k) => (
              <span
                key={k}
                className="w-1.5 rounded-full bg-white motion-safe:animate-pulse"
                style={{ height: `${30 + 70 * Math.abs(Math.sin(elapsed * 6 + k * 0.9))}%`, animationDelay: `${k * 90}ms` }}
              />
            ))}
          </span>
          <Bi text={{ en: `Tap to stop · ${elapsed.toFixed(1)}s`, th: "แตะเพื่อหยุด" }} className="items-center leading-tight" subClassName="text-white/80" />
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-accent w-full gap-3 py-5 text-lg"
          data-sfx="none"
          onClick={speak}
          disabled={busy || locked}
        >
          <svg viewBox="0 0 24 24" className="size-8" aria-hidden fill="currentColor">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <Bi
            text={phase === "starting" ? { en: "Opening the mic…", th: "กำลังเปิดไมค์…" } : again ? { en: "TAP TO SPEAK AGAIN", th: "แตะเพื่อพูดอีกครั้ง" } : { en: "TAP TO SPEAK", th: "แตะเพื่อพูด" }}
            className="items-start leading-tight"
            subClassName="text-white/80"
          />
        </button>
      )}

      {micChanged && phase !== "recording" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-warn-soft p-3 text-sm font-semibold text-warn" role="status">
          <Bi text={{ en: "This looks like a different microphone. A quick check keeps your score fair.", th: "ดูเหมือนเป็นไมค์คนละตัว เช็กสั้น ๆ เพื่อให้คะแนนยุติธรรม" }} className="min-w-0 flex-1" />
          <MicCheckButton />
        </div>
      )}

      <MicGateDialog
        open={gate !== null}
        reason={gate ?? "never"}
        onContinue={() => {
          setGate(null);
          void start(); // inside the tap: the microphone opens here
        }}
      />

      {phase === "analyzing" && <p className="font-bold text-muted">Analysing… <span className="thai">กำลังวิเคราะห์…</span></p>}

      {error && (
        <div className="rounded-xl bg-bad-soft p-3 font-semibold text-bad" role="alert">
          {error}
          <span className="thai block text-sm font-normal">
            ใช้ไมค์ไม่ได้ตอนนี้ ไม่เป็นไร กด “พูดไม่สะดวกตอนนี้” เพื่อทำแบบฝึกหัดฟังแทน
          </span>
          <MicCheckButton className="mt-3" />
        </div>
      )}

      {phase === "done" && analysis && !analysis.result && (
        <div className="rounded-xl bg-warn-soft p-3 font-semibold text-warn" role="alert">
          I couldn&apos;t find a clear voice in that take. Speak a little louder and closer to the mic, then record again.
          <span className="thai block text-sm font-normal">ฟังเสียงไม่ชัด ลองพูดให้ดังขึ้นและใกล้ไมค์ขึ้น แล้วอัดใหม่</span>
          <MicCheckButton className="mt-3" />
        </div>
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
          <div className="flex flex-wrap gap-2" aria-label="Recording quality · คุณภาพเสียงที่อัด">
            {takeChips(analysis.quality).map((c) => (
              <span
                key={c.key}
                className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-sm font-extrabold ${
                  c.level === "good" ? "border-good bg-good-soft text-good" : c.level === "warn" ? "border-warn bg-warn-soft text-warn" : "border-bad bg-bad-soft text-bad"
                }`}
              >
                <span aria-hidden>{c.level === "good" ? "✓" : "!"}</span>
                <Bi text={{ en: `${c.label.en}: ${c.value.en}`, th: `${c.label.th}: ${c.value.th}` }} inline className="flex-row! items-baseline gap-1.5" />
              </span>
            ))}
          </div>
          {analysis.quality.issues.slice(0, 1).map((q, i) => (
            <p
              key={i}
              className={`rounded-xl p-3 text-sm font-semibold ${q.level === "fail" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn"}`}
            >
              {q.en} <span className="thai block font-normal">{q.th}</span>
              {q.level === "fail" && (
                <span className="mt-1 block font-extrabold">
                  <Bi text={{ en: "This take can't be scored fairly. Record it again.", th: "เทคนี้ให้คะแนนอย่างยุติธรรมไม่ได้ อัดใหม่อีกครั้งนะ" }} />
                </span>
              )}
            </p>
          ))}
          {analysis.quality.issues.some((q) => q.level === "fail") && <MicCheckButton className="self-start" />}
          <p className="text-sm text-muted">
            Tap CHECK to see how you did. <span className="thai">กด CHECK เพื่อดูผล</span>
          </p>
        </div>
      )}

      <button
        type="button"
        className="self-center rounded-xl px-3 py-2 text-sm font-extrabold uppercase tracking-wide text-muted hover:bg-line disabled:opacity-40"
        onClick={onSkip}
        disabled={locked || phase === "recording"}
      >
        <Bi text={{ en: "Can't speak now", th: "พูดไม่สะดวกตอนนี้" }} className="items-center" />
      </button>
    </div>
  );
}

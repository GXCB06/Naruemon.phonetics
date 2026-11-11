"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bi } from "@/components/home/lang";
import { ContourChart } from "@/components/lab/ContourChart";
import { KaraokeSentence } from "@/components/lab/KaraokeSentence";
import { ResultPanel } from "@/components/lab/ResultPanel";
import { PlaceholderBadge } from "@/components/learn/ListenButton";
import { MynaSays, SpeakerButton, SpeakerIcon, useClip } from "@/components/learn/ui";
import { MicCheckButton } from "@/components/mic/MicCheckButton";
import { MicGateDialog } from "@/components/mic/MicGateDialog";
import { loadMicProfile } from "@/components/mic/micProfile";
import { Immersive } from "@/components/nav/TabBar";
import { MynaBot, type BotMood } from "@/components/mascot/MynaBot";
import { recordExerciseAttempt } from "@/lib/attempts";
import { micGate, takeBlocksGrade, takeChips, type GateReason } from "@/lib/audio/micProfile";
import { layoutSentence, targetContour } from "@/lib/intonation/contour";
import { allSentences } from "@/lib/learn/content";
import { completeLesson, loadProgress, saveProgress } from "@/lib/progress/store";
import { nextInTopic, scoreWord, speakKey, topicById, topicSentences } from "@/lib/speak/topics";
import { useSpeakTake } from "./useSpeakTake";

/**
 * Speak a sentence: hear it, tap the big mic and say it (it records at once). Your pitch draws live while you speak; after
 * the take you see where your tune left the target, hear yourself next to the model, and go again or on to the next sentence.
 * The best score is kept per sentence; nothing is recorded to a server.
 */
export function SpeakScreen({ topicId, sentenceId }: { topicId: string; sentenceId: string }) {
  const topic = topicById(topicId);
  const all = useMemo(() => allSentences(), []);
  const sentence = all.find((s) => s.id === sentenceId);
  const siblings = useMemo(() => (topic ? topicSentences(topic, all) : []), [topic, all]);
  if (!topic || !sentence || !siblings.some((s) => s.id === sentenceId)) return null;
  // a fresh screen state per sentence
  return <Take key={sentence.id} topicId={topicId} sentenceId={sentenceId} />;
}

function Take({ topicId, sentenceId }: { topicId: string; sentenceId: string }) {
  const topic = topicById(topicId)!;
  const all = useMemo(() => allSentences(), []);
  const sentence = all.find((s) => s.id === sentenceId)!;
  const siblings = useMemo(() => topicSentences(topic, all), [topic, all]);
  const index = siblings.findIndex((s) => s.id === sentenceId);
  const next = nextInTopic(siblings, sentenceId);
  const layout = useMemo(() => layoutSentence(sentence), [sentence]);
  const target = useMemo(() => targetContour(layout), [layout]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const take = useSpeakTake(sentence, canvasRef);
  const { phase, analysis } = take;
  const result = analysis?.result ?? null;
  const [gate, setGate] = useState<GateReason | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const savedFor = useRef<unknown>(null);
  const clip = useClip();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingYou, setPlayingYou] = useState(false);

  const blocked = analysis ? takeBlocksGrade(analysis.quality) : false;

  // Keep the best score and count the take as practice, once per take (a take too quiet to judge is not scored)
  useEffect(() => {
    if (!analysis || !result || blocked || savedFor.current === analysis) return;
    savedFor.current = analysis;
    recordExerciseAttempt(sentence, "shadow", { passed: result.overall >= 70, analysis: result }); // never throws
    saveProgress(completeLesson(loadProgress(), speakKey(sentence.id), { score: result.overall, xp: Math.max(1, Math.round(result.overall / 10)) }));
    setSaved(result.overall);
  }, [analysis, result, blocked, sentence]);

  const speak = () => {
    const d = micGate(loadMicProfile(), null, Date.now());
    if (d.need && d.reason) setGate(d.reason);
    else void take.start();
  };

  const playYou = () => {
    if (!take.playbackUrl) return;
    audioRef.current?.pause();
    const a = new Audio(take.playbackUrl);
    audioRef.current = a;
    a.onplay = () => setPlayingYou(true);
    a.onended = a.onpause = a.onerror = () => setPlayingYou(false);
    void a.play().catch(() => setPlayingYou(false));
  };
  useEffect(() => () => audioRef.current?.pause(), []);

  const mood: BotMood =
    phase === "recording" ? "listening" : phase === "analyzing" ? "thinking" : phase === "done" ? (blocked || !result ? "sad" : result.overall >= 80 ? "perfect" : result.overall >= 55 ? "happy" : "wink") : phase === "error" ? "sad" : "idle";
  const score = result?.overall ?? null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-10">
      <Immersive />
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-bg py-3">
        <Link href={`/lab/${topicId}`} aria-label="Back · กลับ" className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-line hover:text-ink">
          <svg viewBox="0 0 24 24" className="size-7" aria-hidden fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-muted">
            <Bi text={topic.title} inline className="flex-row! items-baseline gap-2" />
          </p>
        </div>
        <span className="shrink-0 text-sm font-black tabular-nums text-muted">
          {index + 1} / {siblings.length}
        </span>
      </header>

      <main className="flex flex-1 flex-col gap-6 pt-2">
        <MynaSays mood={mood}>
          <div className="flex items-center gap-3">
            <SpeakerButton sentence={sentence} size="md" />
            <div className="min-w-0 flex-1">
              {phase === "recording" ? (
                <KaraokeSentence sentence={sentence} elapsedSec={take.elapsed} />
              ) : (
                <p className="text-xl font-bold leading-snug sm:text-2xl">{sentence.text}</p>
              )}
            </div>
          </div>
        </MynaSays>

        <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-muted">
          <span className="rounded-full bg-accent-soft px-3 py-1 font-extrabold text-accent">
            {[...new Set(sentence.groups.map((g) => g.pattern))].join(" | ")}
          </span>
          <Bi text={sentence.note} inline subClassName="hidden" />
        </p>

        {/* live pitch while speaking */}
        <div className={phase === "recording" ? "card p-2" : "hidden"}>
          <canvas ref={canvasRef} width={1000} height={220} className="h-36 w-full" />
          <p className="px-2 pb-1 text-xs font-semibold text-muted">
            <Bi text={{ en: "Your voice, going up and down", th: "เสียงของคุณขึ้นลง" }} inline className="flex-row! gap-2" />
          </p>
        </div>

        {phase === "recording" ? (
          <button type="button" className="btn btn-bad w-full flex-col gap-1 py-5 text-lg" onClick={() => void take.stop()} aria-label={`Stop recording (${take.elapsed.toFixed(1)} seconds)`}>
            <span className="flex h-8 items-end gap-1" aria-hidden>
              {[0, 1, 2, 3, 4, 5, 6].map((k) => (
                <span key={k} className="w-1.5 rounded-full bg-white transition-[height] duration-100" style={{ height: `${18 + 82 * take.level * (0.55 + 0.45 * Math.abs(Math.sin(take.elapsed * 7 + k * 0.9)))}%` }} />
              ))}
            </span>
            <Bi text={{ en: `Tap to stop · ${take.elapsed.toFixed(1)}s`, th: "แตะเพื่อหยุด" }} className="items-center leading-tight" subClassName="text-white/80" />
          </button>
        ) : phase === "done" || phase === "analyzing" ? null : (
          <button type="button" className="btn btn-accent w-full gap-3 py-5 text-lg" onClick={speak} disabled={phase === "starting"}>
            <svg viewBox="0 0 24 24" className="size-8" aria-hidden fill="currentColor">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <Bi
              text={phase === "starting" ? { en: "Opening the mic…", th: "กำลังเปิดไมค์…" } : { en: "TAP TO SPEAK", th: "แตะเพื่อพูด" }}
              className="items-start leading-tight"
              subClassName="text-white/80"
            />
          </button>
        )}

        {phase === "analyzing" && (
          <p className="text-center font-bold text-muted">
            <Bi text={{ en: "Analysing…", th: "กำลังวิเคราะห์…" }} className="items-center" />
          </p>
        )}

        {take.error && (
          <div className="rounded-xl bg-bad-soft p-3 font-semibold text-bad" role="alert">
            {take.error}
            <MicCheckButton className="mt-3" />
          </div>
        )}

        {take.micChanged && phase !== "recording" && (
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
            void take.start(); // inside the tap: the microphone opens here
          }}
        />

        {phase === "done" && analysis && (
          <section className="pop-in flex flex-col gap-4" aria-label="Your result · ผลของคุณ">
            {/* score */}
            <div className="flex items-center gap-4">
              <MynaBot mood={mood} className="size-16 shrink-0" />
              <div className="min-w-0">
                {score !== null && !blocked ? (
                  <>
                    <p className="text-5xl font-black tabular-nums leading-none">
                      {score}
                      <span className="text-2xl text-muted">/100</span>
                    </p>
                    <p className="mt-1 text-lg font-black">
                      <Bi text={scoreWord(score)} inline className="flex-row! items-baseline gap-2" />
                      {saved !== null && score >= (saved ?? 0) && <span className="ml-2 text-sm text-good">✓</span>}
                    </p>
                  </>
                ) : (
                  <p className="text-lg font-black text-bad">
                    <Bi text={blocked ? { en: "This take can't be scored fairly", th: "เทคนี้ให้คะแนนอย่างยุติธรรมไม่ได้" } : { en: "I couldn't find a clear voice", th: "ฟังเสียงไม่ชัด" }} />
                  </p>
                )}
              </div>
            </div>

            {/* quality chips */}
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
              <p key={i} className={`rounded-xl p-3 text-sm font-semibold ${q.level === "fail" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn"}`}>
                {q.en} <span className="thai block font-normal">{q.th}</span>
              </p>
            ))}

            {/* where the tune went off */}
            {result && !blocked && (
              <div className="card overflow-hidden p-2">
                <ContourChart
                  layout={layout}
                  lines={[
                    { contour: target, color: "var(--target)", dashed: true, width: 4 },
                    { contour: result.aligned, color: "var(--learner)", width: 5 },
                  ]}
                  className="w-full"
                />
                <p className="px-2 pb-1 text-xs font-semibold text-muted">
                  <span className="font-black text-[var(--target)]">- - -</span> <Bi text={{ en: "target", th: "ต้นแบบ" }} inline className="flex-row! gap-1" />
                  &nbsp;&nbsp;
                  <span className="font-black text-accent">——</span> <Bi text={{ en: "you", th: "คุณ" }} inline className="flex-row! gap-1" />
                </p>
              </div>
            )}

            {/* you next to the model */}
            <div className="grid grid-cols-2 gap-3">
              <button type="button" className="pick flex min-h-16 items-center justify-center gap-3 px-3" onClick={playYou}>
                <SpeakerIcon className="size-7" on={playingYou} />
                <Bi text={{ en: "You", th: "คุณ" }} className="font-extrabold" />
              </button>
              <button type="button" className="pick flex min-h-16 items-center justify-center gap-3 px-3" onClick={() => void clip.play("model", sentence)}>
                <SpeakerIcon className="size-7" on={clip.playing === "model"} />
                <Bi text={{ en: "Model", th: "ต้นแบบ" }} className="font-extrabold" />
              </button>
              {clip.source === "placeholder" && (
                <div className="col-span-2">
                  <PlaceholderBadge />
                </div>
              )}
            </div>

            {result && !blocked && (
              <div className="card p-4 sm:p-5">
                <ResultPanel result={result} />
              </div>
            )}

            <div className="flex flex-col gap-3">
              {next && (
                <Link href={`/lab/${topicId}/${next.id}`} className="btn btn-good w-full py-4 text-lg tracking-wide">
                  <Bi text={{ en: "NEXT SENTENCE", th: "ประโยคถัดไป" }} className="items-center leading-tight" subClassName="text-white/80" />
                </Link>
              )}
              <button type="button" className="btn w-full py-4 text-lg tracking-wide" onClick={take.reset}>
                <Bi text={{ en: "TRY AGAIN", th: "ลองใหม่" }} className="items-center leading-tight" />
              </button>
              <Link href={`/lab/${topicId}`} className="rounded-xl px-3 py-2 text-center text-sm font-extrabold uppercase tracking-wide text-muted hover:bg-line">
                <Bi text={{ en: "Back to the list", th: "กลับไปรายการ" }} className="items-center" />
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeVoice, type VoiceAnalysis } from "@/lib/audio/analyzeVoice";
import { makeLivePitch } from "@/lib/audio/pitch";
import { decodeAudioFile, MicError, MicRecorder } from "@/lib/audio/recorder";
import { decodeWav } from "@/lib/audio/wav";
import type { Contour, Layout, Sentence } from "@/lib/intonation/types";
import { ContourChart } from "./ContourChart";
import { ResultPanel } from "./ResultPanel";

const MAX_SEC = 12;

export interface SampleInfo {
  file: string;
  label: string;
  expect: string;
}

type Phase = "idle" | "recording" | "analyzing" | "done" | "error";

/** Calls `onTick(seconds)` every 100 ms; returns the interval id. */
function startElapsedTimer(onTick: (sec: number) => void): number {
  const t0 = performance.now();
  return window.setInterval(() => onTick((performance.now() - t0) / 1000), 100);
}

export function VoicePanel({
  sentence,
  layout,
  target,
  samples,
}: {
  sentence: Sentence;
  layout: Layout;
  target: Contour;
  samples: SampleInfo[];
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<VoiceAnalysis | null>(null);
  const [rawWarning, setRawWarning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [source, setSource] = useState<string>("");
  const recRef = useRef<MicRecorder | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<{ t: number; hz: number | null }[]>([]);
  const timerRef = useRef<number | null>(null);

  const playbackUrl = useMemo(
    () => (analysis ? URL.createObjectURL(new Blob([analysis.playback as BlobPart], { type: "audio/wav" })) : null),
    [analysis],
  );
  const wav16Url = useMemo(
    () => (analysis ? URL.createObjectURL(new Blob([analysis.wav16k as BlobPart], { type: "audio/wav" })) : null),
    [analysis],
  );
  useEffect(() => () => void (playbackUrl && URL.revokeObjectURL(playbackUrl)), [playbackUrl]);
  useEffect(() => () => void (wav16Url && URL.revokeObjectURL(wav16Url)), [wav16Url]);

  // (The parent remounts this panel per sentence via `key`, so a new sentence starts clean.)

  const runAnalysis = (raw: Float32Array, sr: number, label: string) => {
    setPhase("analyzing");
    setSource(label);
    // let the UI paint "Analysing…" first
    setTimeout(() => {
      const a = analyzeVoice(raw, sr, sentence);
      setAnalysis(a);
      setPhase("done");
    }, 30);
  };

  const drawLive = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = c.width;
    const h = c.height;
    ctx.clearRect(0, 0, w, h);
    const styles = getComputedStyle(c);
    ctx.strokeStyle = styles.getPropertyValue("--level-line") || "#ddd";
    ctx.lineWidth = 2;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (h * i) / 4);
      ctx.lineTo(w, (h * i) / 4);
      ctx.stroke();
    }
    const pts = liveRef.current;
    // log-frequency axis 70–450 Hz
    const y = (hz: number) => h - ((Math.log2(hz) - Math.log2(70)) / (Math.log2(450) - Math.log2(70))) * h;
    ctx.strokeStyle = styles.getPropertyValue("--learner") || "#2c6e63";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    let pen = false;
    for (const p of pts) {
      const x = (p.t / MAX_SEC) * w;
      if (p.hz === null) {
        pen = false;
        continue;
      }
      if (pen) ctx.lineTo(x, y(p.hz));
      else ctx.moveTo(x, y(p.hz));
      pen = true;
    }
    ctx.stroke();
  };

  const start = async () => {
    setError(null);
    setAnalysis(null);
    liveRef.current = [];
    const rec = new MicRecorder();
    recRef.current = rec;
    let live: ReturnType<typeof makeLivePitch> | null = null;
    let ring = new Float32Array(0);
    let samplesSeen = 0;
    try {
      await rec.start({
        onChunk: (chunk, sr) => {
          live ??= makeLivePitch(sr);
          const merged = new Float32Array(ring.length + chunk.length);
          merged.set(ring);
          merged.set(chunk, ring.length);
          ring = merged.slice(Math.max(0, merged.length - live.windowLength));
          samplesSeen += chunk.length;
          if (ring.length === live.windowLength) {
            liveRef.current.push({ t: samplesSeen / sr, hz: live.detect(ring) });
            drawLive();
          }
          if (samplesSeen / sr >= MAX_SEC) void stop();
        },
      });
      setRawWarning(!rec.rawAudio);
      setPhase("recording");
      timerRef.current = startElapsedTimer(setElapsed);
    } catch (e) {
      setPhase("error");
      setError(e instanceof MicError ? e.message : String(e));
    }
  };

  const stop = async () => {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    if (timerRef.current) window.clearInterval(timerRef.current);
    const raw = await rec.stop();
    runAnalysis(raw, rec.sampleRate, "Your recording");
  };

  const loadSample = async (s: SampleInfo) => {
    setError(null);
    const res = await fetch(`/samples/${s.file}`);
    const { samples: raw, sampleRate } = decodeWav(new Uint8Array(await res.arrayBuffer()));
    runAnalysis(raw, sampleRate, `Sample: ${s.label}`);
  };

  const loadFile = async (f: File) => {
    setError(null);
    try {
      const { samples: raw, sampleRate } = await decodeAudioFile(f);
      runAnalysis(raw, sampleRate, `File: ${f.name}`);
    } catch {
      setPhase("error");
      setError("Couldn't read that audio file. Try a WAV, MP3 or M4A file.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {phase !== "recording" ? (
          <button className="btn btn-accent text-lg" onClick={start} disabled={phase === "analyzing"}>
            🎙️ Record
          </button>
        ) : (
          <button className="btn btn-danger text-lg" onClick={() => void stop()}>
            ■ Stop ({elapsed.toFixed(1)}s)
          </button>
        )}
        <span className="text-sm text-muted">
          Tap, read the sentence once, tap again. Quiet room, wired or built-in mic (not Bluetooth).
          <span className="thai block">กดอัด อ่านประโยคหนึ่งครั้ง แล้วกดหยุด ใช้ไมค์ในตัวหรือแบบมีสาย (ไม่ใช่บลูทูธ)</span>
        </span>
      </div>

      <div className={phase === "recording" ? "card p-2" : "hidden"}>
        <canvas ref={canvasRef} width={1000} height={220} className="h-40 w-full" />
        <p className="px-2 pb-1 text-xs text-muted">Live pitch — your voice going up and down.</p>
      </div>

      <details className="card p-4">
        <summary className="cursor-pointer font-extrabold">No mic? Try a test sample or upload a file</summary>
        <p className="mt-2 text-sm text-muted">
          Samples are a synthetic “robot voice” that follows the target pitch, plus versions with typical errors. They
          test the pitch tracker and rule engine; real voices come next.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {samples.map((s) => (
            <button key={s.file} className="btn px-3 py-2 text-sm" onClick={() => void loadSample(s)}>
              ▶ {s.label}
            </button>
          ))}
        </div>
        <label className="mt-3 block text-sm font-bold">
          Upload a recording:{" "}
          <input
            type="file"
            accept="audio/*"
            className="text-sm"
            onChange={(e) => e.target.files?.[0] && void loadFile(e.target.files[0])}
          />
        </label>
      </details>

      {rawWarning && (
        <p className="rounded-xl bg-warn-soft p-3 text-sm font-semibold text-warn">
          This browser kept some voice processing on (auto gain / noise suppression). Results may be less accurate.
        </p>
      )}
      {error && <p className="rounded-xl bg-bad-soft p-3 font-semibold text-bad">{error}</p>}
      {phase === "analyzing" && <p className="font-bold text-muted">Analysing…</p>}

      {phase === "done" && analysis && (
        <div className="flex flex-col gap-4">
          <div className="card overflow-hidden p-2">
            <ContourChart
              layout={layout}
              lines={[
                { contour: target, color: "var(--target)", dashed: true, width: 4 },
                ...(analysis.result ? [{ contour: analysis.result.aligned, color: "var(--learner)", width: 5 }] : []),
              ]}
              className="w-full"
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 pb-2 text-xs text-muted">
              <span>
                <span className="font-black text-[var(--target)]">- - -</span> target
              </span>
              <span>
                <span className="font-black text-accent">——</span> {source}
              </span>
              <span>Time is stretched to fit each thought group (exact syllable timing comes in Phase 0b).</span>
            </div>
          </div>
          {playbackUrl && <audio controls src={playbackUrl} className="w-full" />}
          {analysis.quality.issues.length > 0 && (
            <ul className="flex flex-col gap-2">
              {analysis.quality.issues.map((q, i) => (
                <li
                  key={i}
                  className={`rounded-xl p-3 text-sm font-semibold ${q.level === "fail" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn"}`}
                >
                  {q.en} <span className="thai block font-normal">{q.th}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="card p-4 sm:p-5">
            {analysis.result ? (
              <ResultPanel result={analysis.result} />
            ) : (
              <p className="font-semibold text-bad">
                I couldn&apos;t find a clear voice in this take. Speak louder and closer to the mic.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
            <span>Baseline (your level 2): {analysis.level ? `${Math.round(analysis.level.baselineHz)} Hz` : "—"}</span>
            <span>Speech: {analysis.quality.speechDb.toFixed(0)} dBFS</span>
            <span>Noise: {analysis.quality.noiseDb.toFixed(0)} dBFS</span>
            <span>Mic rate: {analysis.sampleRate} Hz</span>
            {wav16Url && (
              <a className="font-bold text-accent underline" href={wav16Url} download={`${sentence.id}-16k.wav`}>
                Download 16 kHz WAV (for the Phase 0a test set)
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

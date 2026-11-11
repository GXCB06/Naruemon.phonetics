"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { analyzeVoice, type VoiceAnalysis } from "@/lib/audio/analyzeVoice";
import { makeLivePitch } from "@/lib/audio/pitch";
import { rmsDb } from "@/lib/audio/quality";
import { MicError, MicRecorder } from "@/lib/audio/recorder";
import type { Sentence } from "@/lib/intonation/types";
import { loadMicProfile } from "@/components/mic/micProfile";
import { micGate } from "@/lib/audio/micProfile";

const MAX_SEC = 12;

export type TakePhase = "idle" | "starting" | "recording" | "analyzing" | "done" | "error";

/**
 * One spoken take of one sentence: open the mic inside the tap, record at once (no countdown), draw the learner's pitch
 * live on `canvasRef` while they speak, then analyse with the same voice pipeline the lessons use. Nothing is stored.
 */
export function useSpeakTake(sentence: Sentence, canvasRef: RefObject<HTMLCanvasElement | null>) {
  const [phase, setPhase] = useState<TakePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<VoiceAnalysis | null>(null);
  const [elapsed, setElapsed] = useState(0);
  /** Loudness of the last moment, 0..1, for the bars on the mic button. */
  const [level, setLevel] = useState(0);
  /** The microphone in use is not the one that was checked. */
  const [micChanged, setMicChanged] = useState(false);

  const recRef = useRef<MicRecorder | null>(null);
  const liveRef = useRef<{ t: number; hz: number | null }[]>([]);
  const timerRef = useRef<number | null>(null);
  const levelRef = useRef(0);
  const seenRef = useRef(0);
  const goRef = useRef<number | null>(null);
  const stopRef = useRef<() => Promise<void>>(async () => undefined);

  const playbackUrl = useMemo(
    () => (analysis ? URL.createObjectURL(new Blob([analysis.playback as BlobPart], { type: "audio/wav" })) : null),
    [analysis],
  );
  useEffect(() => () => void (playbackUrl && URL.revokeObjectURL(playbackUrl)), [playbackUrl]);

  // Leaving the screen mid-take must release the microphone.
  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      const rec = recRef.current;
      recRef.current = null;
      void rec?.stop().catch(() => undefined);
    },
    [],
  );

  const drawLive = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const { width: w, height: h } = c;
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
    // log-frequency axis 70-450 Hz: your voice going up and down
    const y = (hz: number) => h - ((Math.log2(hz) - Math.log2(70)) / (Math.log2(450) - Math.log2(70))) * h;
    ctx.strokeStyle = styles.getPropertyValue("--learner") || "#2c6e63";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    let pen = false;
    for (const p of liveRef.current) {
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
  }, [canvasRef]);

  const stop = useCallback(async () => {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    const go = goRef.current ?? 0;
    goRef.current = null;
    const raw = await rec.stop();
    setPhase("analyzing");
    setLevel(0);
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
  }, [sentence]);
  useEffect(() => {
    stopRef.current = stop; // the recorder callback (created once, in start) calls the latest stop
  });

  /** Call from inside the learner's tap: the browser needs that to open the microphone (iOS). */
  const start = useCallback(async () => {
    setError(null);
    setAnalysis(null);
    setElapsed(0);
    setLevel(0);
    liveRef.current = [];
    seenRef.current = 0;
    goRef.current = null;
    setPhase("starting");
    const rec = new MicRecorder();
    recRef.current = rec;
    let livePitch: ReturnType<typeof makeLivePitch> | null = null;
    let ring = new Float32Array(0);
    try {
      await rec.start({
        onChunk: (chunk, sr) => {
          livePitch ??= makeLivePitch(sr);
          const merged = new Float32Array(ring.length + chunk.length);
          merged.set(ring);
          merged.set(chunk, ring.length);
          ring = merged.slice(Math.max(0, merged.length - livePitch.windowLength));
          seenRef.current += chunk.length;
          const go = goRef.current;
          if (go === null) return; // mic not open yet
          const t = (seenRef.current - go) / sr;
          levelRef.current = Math.max(0, Math.min(1, (rmsDb(chunk) + 60) / 50));
          if (ring.length === livePitch.windowLength) {
            liveRef.current.push({ t, hz: livePitch.detect(ring) });
            drawLive();
          }
          if (t >= MAX_SEC) void stopRef.current();
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
      timerRef.current = window.setInterval(() => {
        setElapsed((performance.now() - t0) / 1000);
        setLevel(levelRef.current);
      }, 100);
    } catch (e) {
      recRef.current = null;
      setPhase("error");
      setError(e instanceof MicError ? e.message : "Couldn't start the microphone.");
    }
  }, [drawLive]);

  const reset = useCallback(() => {
    setPhase("idle");
    setAnalysis(null);
    setError(null);
  }, []);

  return { phase, error, analysis, elapsed, level, micChanged, playbackUrl, start, stop, reset };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { assessQuality, rmsDb } from "@/lib/audio/quality";
import { resampleAudio } from "@/lib/audio/resample";
import { MicError, MicRecorder } from "@/lib/audio/recorder";
import { encodeWav } from "@/lib/audio/wav";
import type { AzureAssessment } from "@/lib/azure/parse";
import { loadMicProfile } from "@/components/mic/micProfile";
import { micGate } from "@/lib/audio/micProfile";

/** A sentence is read in one take; this is the longest we record (Azure scores about 30 seconds in one go). */
export const MAX_READ_SEC = 28;

export type ReadPhase = "idle" | "starting" | "recording" | "scoring" | "done" | "error";

const ERRORS = {
  quiet: { en: "That was too quiet to score. Speak up or move closer to the mic, then try again.", th: "เบาเกินกว่าจะให้คะแนน พูดให้ดังขึ้นหรือเข้าใกล้ไมค์ แล้วลองใหม่" },
  short: { en: "I didn't catch enough. Read the whole sentence, then tap to stop.", th: "ได้ยินไม่พอ อ่านให้จบทั้งประโยค แล้วแตะเพื่อหยุด" },
  rate: { en: "Too many tries. Wait a minute and try again.", th: "ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่" },
  unconfigured: { en: "Scoring isn't set up on this server yet.", th: "เซิร์ฟเวอร์นี้ยังไม่ได้ตั้งค่าการให้คะแนน" },
  token: { en: "Couldn't reach the scoring service just now. Try again soon.", th: "ติดต่อบริการให้คะแนนไม่ได้ในตอนนี้ ลองใหม่อีกครั้ง" },
  nomatch: { en: "I didn't hear any speech that matches the sentence. Try again.", th: "ไม่ได้ยินเสียงที่ตรงกับประโยค ลองใหม่อีกครั้ง" },
  other: { en: "This take couldn't be scored. Try again.", th: "เทคนี้ให้คะแนนไม่ได้ ลองใหม่อีกครั้ง" },
} as const;
export type ReadError = { en: string; th: string };

/**
 * Record one sentence read aloud and have it scored word by word. The mic opens inside the tap and records at once; the
 * clip goes to Azure for one scoring (token from /api/speech-token) and is not stored anywhere.
 */
export function useReadScore(onResult: (key: number, assessment: AzureAssessment) => void) {
  const [phase, setPhase] = useState<ReadPhase>("idle");
  const [error, setError] = useState<ReadError | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [micChanged, setMicChanged] = useState(false);
  /** The sentence (its key) being recorded, scored, or just finished; null when idle. */
  const [active, setActive] = useState<number | null>(null);
  /** The text being read (what Azure compares the speech with), and which sentence it is (the caller's key). */
  const textRef = useRef("");
  const keyRef = useRef(0);
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  });
  const recRef = useRef<MicRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const levelRef = useRef(0);
  const seenRef = useRef(0);
  const goRef = useRef<number | null>(null);
  const stopRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      const rec = recRef.current;
      recRef.current = null;
      void rec?.stop().catch(() => undefined);
    },
    [],
  );

  const fail = useCallback((e: ReadError) => {
    setError(e);
    setPhase("error");
  }, []);

  const score = useCallback(
    async (raw: Float32Array, sampleRate: number) => {
      const quality = assessQuality(raw, sampleRate);
      if (raw.length < sampleRate * 0.6) return fail(ERRORS.short);
      if (quality.issues.some((i) => i.level === "fail")) return fail(ERRORS.quiet);
      const wav16k = encodeWav(resampleAudio(raw, sampleRate, 16000), 16000);
      try {
        const res = await fetch("/api/speech-token", { method: "POST" });
        if (res.status === 501) return fail(ERRORS.unconfigured);
        if (res.status === 429) return fail(ERRORS.rate);
        if (!res.ok) return fail(ERRORS.token);
        const { token, region } = (await res.json()) as { token: string; region: string };
        // loaded on demand so the Speech SDK stays out of the first-load bundle
        const { assessPronunciation, AzureAssessError } = await import("@/lib/azure/assess");
        try {
          const a = await assessPronunciation({ wav16k, referenceText: textRef.current, token, region });
          if (a.status !== "Success" || a.words.length === 0) return fail(ERRORS.nomatch);
          onResultRef.current(keyRef.current, a);
          setPhase("done");
        } catch (e) {
          fail(e instanceof AzureAssessError && e.code === "no_match" ? ERRORS.nomatch : ERRORS.other);
        }
      } catch {
        fail(ERRORS.token);
      }
    },
    [fail],
  );

  const stop = useCallback(async () => {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    const go = goRef.current ?? 0;
    goRef.current = null;
    const raw = await rec.stop();
    setPhase("scoring");
    setLevel(0);
    await score(raw.subarray(Math.min(go, raw.length)), rec.sampleRate);
  }, [score]);
  useEffect(() => {
    stopRef.current = stop;
  });

  /** Call from inside the learner's tap: the browser needs that to open the microphone (iOS). */
  const start = useCallback(
    async (text: string, key: number) => {
      textRef.current = text;
      keyRef.current = key;
      setActive(key);
      setError(null);
      setElapsed(0);
      setLevel(0);
      seenRef.current = 0;
      goRef.current = null;
      setPhase("starting");
      const rec = new MicRecorder();
      recRef.current = rec;
      try {
        await rec.start({
          onChunk: (chunk, sr) => {
            seenRef.current += chunk.length;
            const go = goRef.current;
            if (go === null) return;
            levelRef.current = Math.max(0, Math.min(1, (rmsDb(chunk) + 60) / 50));
            if ((seenRef.current - go) / sr >= MAX_READ_SEC) void stopRef.current();
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
        setError(e instanceof MicError ? { en: e.message, th: "ใช้ไมค์ไม่ได้ตอนนี้ ลองเช็กไมค์ดู" } : ERRORS.other);
        setPhase("error");
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
    setActive(null);
  }, []);

  return { phase, error, elapsed, level, micChanged, active, start, stop, reset };
}

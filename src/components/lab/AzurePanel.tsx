"use client";

import { useMemo, useState } from "react";
import type { VoiceAnalysis } from "@/lib/audio/analyzeVoice";
import { analyzeVoiceAligned } from "@/lib/azure/align";
import type { AzureAssessment } from "@/lib/azure/parse";
import { layoutSentence, targetContour } from "@/lib/intonation/contour";
import type { Sentence } from "@/lib/intonation/types";
import { ContourChart } from "./ContourChart";
import { IpaLayer } from "./IpaLayer";
import { ResultPanel } from "./ResultPanel";

type State =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; result: AzureAssessment }
  | { kind: "unconfigured" }
  | { kind: "error"; en: string; th: string };

const ERRORS = {
  rate: { en: "Too many tries. Wait a minute and try again.", th: "ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่" },
  token: { en: "Couldn't reach Azure just now. Try again soon.", th: "ติดต่อ Azure ไม่ได้ในตอนนี้ ลองใหม่อีกครั้ง" },
  nomatch: { en: "Azure didn't hear any speech in this take.", th: "Azure ไม่ได้ยินเสียงพูดในเทคนี้" },
  other: { en: "Azure couldn't score this take.", th: "Azure ให้คะแนนเทคนี้ไม่ได้" },
};

function tone(score: number | null): string {
  if (score === null) return "text-muted";
  return score >= 80 ? "text-good" : score >= 60 ? "text-warn" : "text-bad";
}
const fmt = (n: number | null) => (n === null ? "—" : String(Math.round(n)));

/**
 * Optional "Score with Azure (beta)" button and a read-only result panel. Needs AZURE_SPEECH_KEY on the server.
 * With `voice` and `sentence`, a successful score also re-analyses the take with Azure's syllable timing.
 */
export function AzurePanel({
  wav16k,
  referenceText,
  voice,
  sentence,
}: {
  wav16k: Uint8Array;
  referenceText: string;
  voice?: VoiceAnalysis;
  sentence?: Sentence;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });

  const run = async () => {
    setState({ kind: "running" });
    try {
      const res = await fetch("/api/speech-token", { method: "POST" });
      if (res.status === 501) return setState({ kind: "unconfigured" });
      if (res.status === 429) return setState({ kind: "error", ...ERRORS.rate });
      if (!res.ok) return setState({ kind: "error", ...ERRORS.token });
      const { token, region } = (await res.json()) as { token: string; region: string };
      // Loaded on demand so the Speech SDK stays out of the first-load bundle.
      const { assessPronunciation, AzureAssessError } = await import("@/lib/azure/assess");
      try {
        const result = await assessPronunciation({ wav16k, referenceText, token, region });
        if (result.status !== "Success" || result.words.length === 0) return setState({ kind: "error", ...ERRORS.nomatch });
        setState({ kind: "done", result });
      } catch (e) {
        setState({ kind: "error", ...(e instanceof AzureAssessError && e.code === "no_match" ? ERRORS.nomatch : ERRORS.other) });
      }
    } catch {
      setState({ kind: "error", ...ERRORS.token });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn px-3 py-2 text-sm" onClick={() => void run()} disabled={state.kind === "running"}>
          {state.kind === "running" ? "Scoring…" : "☁️ Score with Azure (beta)"}
        </button>
        <span className="text-xs text-muted">Sends this take to Microsoft for a second opinion. Optional.</span>
      </div>

      {state.kind === "unconfigured" && (
        <p className="rounded-xl bg-accent-soft p-3 text-sm font-semibold">
          Azure isn&apos;t set up yet — everything else in the lab works without it.
          <span className="thai block font-normal">ยังไม่ได้ตั้งค่า Azure — ส่วนอื่นของแล็บใช้ได้ตามปกติ</span>
        </p>
      )}
      {state.kind === "error" && (
        <p className="rounded-xl bg-warn-soft p-3 text-sm font-semibold text-warn">
          {state.en}
          <span className="thai block font-normal">{state.th}</span>
        </p>
      )}
      {state.kind === "done" && <AzureResultView a={state.result} voice={voice} sentence={sentence} />}
    </div>
  );
}

/** The read-only result: scores, intonation flags, the take re-analysed with Azure's timing, and the IPA layer. */
export function AzureResultView({ a, voice, sentence }: { a: AzureAssessment; voice?: VoiceAnalysis; sentence?: Sentence }) {
  const scores: [string, number | null][] = [
    ["Overall", a.pronScore],
    ["Accuracy", a.accuracy],
    ["Fluency", a.fluency],
    ["Completeness", a.completeness],
    ["Prosody", a.prosodyScore],
  ];
  return (
    <details className="card p-4" open>
      <summary className="cursor-pointer font-extrabold">
        Azure result <span className="text-xs font-semibold text-muted">(beta, read-only)</span>
      </summary>
      <div className="mt-3 flex flex-wrap gap-2">
        {scores.map(([label, v]) => (
          <div key={label} className="rounded-xl bg-accent-soft px-3 py-2 text-center">
            <div className={`text-xl font-black ${tone(v)}`}>{fmt(v)}</div>
            <div className="text-xs text-muted">{label}</div>
          </div>
        ))}
      </div>
      <p
        className={`mt-3 rounded-xl p-3 text-sm font-semibold ${a.monotone ? "bg-bad-soft text-bad" : "bg-good-soft text-good"}`}
      >
        {a.monotone ? "Monotone: your pitch stayed too flat." : "Intonation: not flagged as monotone."}
        <span className="thai block font-normal">
          {a.monotone ? "น้ำเสียงราบเรียบเกินไป ลองให้เสียงขึ้นลงมากขึ้น" : "ไม่พบว่าน้ำเสียงราบเรียบเกินไป"}
        </span>
      </p>
      {a.breaks.length > 0 && (
        <p className="mt-2 text-sm text-muted">
          Pauses flagged:{" "}
          {a.breaks
            .map((b) => `${b.type === "missing" ? "missing pause" : "unexpected pause"} after “${a.words[b.wordIndex]?.word ?? "?"}”`)
            .join("; ")}
        </p>
      )}
      {voice && sentence && <AlignedResult a={a} voice={voice} sentence={sentence} />}
      <div className="mt-4">
        <IpaLayer assessment={a} />
      </div>
    </details>
  );
}

/** The same rule engine, now fed Azure's word/syllable timing: the peak-position check runs for voice. */
function AlignedResult({ a, voice, sentence }: { a: AzureAssessment; voice: VoiceAnalysis; sentence: Sentence }) {
  const aligned = useMemo(() => analyzeVoiceAligned(voice, a, sentence), [voice, a, sentence]);
  const layout = useMemo(() => layoutSentence(sentence), [sentence]);
  const target = useMemo(() => targetContour(layout), [layout]);
  if (!aligned) return null;
  const note =
    aligned.mode === "aligned"
      ? null
      : aligned.mode === "partial"
        ? {
            en: "Part of this take could not be matched to Azure's words, so the peak position was only checked where it could.",
            th: "จับคู่บางส่วนของเทคนี้กับคำของ Azure ไม่ได้ จึงตรวจตำแหน่งจุดสูงสุดได้เฉพาะบางส่วน",
          }
        : {
            en: "Azure's words could not be matched to the sentence, so this is the same stretched result as above.",
            th: "จับคู่คำของ Azure กับประโยคไม่ได้ ผลนี้จึงเหมือนผลด้านบนที่ยืดเวลา",
          };
  return (
    <section aria-label="Aligned with Azure" className="mt-4 flex flex-col gap-3 rounded-2xl border-2 border-accent p-3 sm:p-4">
      <div>
        <h3 className="font-extrabold text-accent">
          Aligned with Azure <span className="thai font-semibold">/ จัดเวลาตาม Azure</span>
        </h3>
        <p className="text-sm text-muted">
          Each syllable is placed where Azure heard it, so the peak position is checked too.
          <span className="thai block">วางแต่ละพยางค์ตามเวลาที่ Azure ได้ยิน จึงตรวจตำแหน่งจุดสูงสุดได้ด้วย</span>
        </p>
      </div>
      <div className="card overflow-hidden p-2">
        <ContourChart
          layout={layout}
          lines={[
            { contour: target, color: "var(--target)", dashed: true, width: 4 },
            { contour: aligned.aligned, color: "var(--learner)", width: 5 },
          ]}
          className="w-full"
        />
      </div>
      {note && (
        <p className="rounded-xl bg-warn-soft p-3 text-sm font-semibold text-warn">
          {note.en}
          <span className="thai block font-normal">{note.th}</span>
        </p>
      )}
      {aligned.warnings.length > 0 && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer font-bold">
            Alignment notes ({aligned.warnings.length}) <span className="thai">/ หมายเหตุการจัดเวลา</span>
          </summary>
          <ul className="mt-1 list-disc pl-5">
            {aligned.warnings.map((w, i) => (
              <li key={i}>
                {w.message.en} <span className="thai">{w.message.th}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <ResultPanel result={aligned} />
    </section>
  );
}

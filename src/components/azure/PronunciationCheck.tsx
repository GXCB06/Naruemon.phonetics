"use client";

import { useMemo, useState } from "react";
import { Bi } from "@/components/home/lang";
import { ContourChart } from "@/components/lab/ContourChart";
import { IpaLayer } from "@/components/lab/IpaLayer";
import type { VoiceAnalysis } from "@/lib/audio/analyzeVoice";
import { layoutSentence, targetContour } from "@/lib/intonation/contour";
import type { CheckStatus, Sentence } from "@/lib/intonation/types";
import type { AlignedAnalysis } from "@/lib/azure/align";
import { scoreWithAzure, type AzureCheckState, type PronunciationScore } from "@/lib/azure/score";

const ERROR: Record<"rate" | "error", { en: string; th: string }> = {
  rate: { en: "Too many tries. Wait a minute and try again.", th: "ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่" },
  error: { en: "Azure couldn't score this take. Try again, or keep practising without it.", th: "Azure ให้คะแนนเทคนี้ไม่ได้ ลองใหม่ หรือฝึกต่อโดยไม่ต้องใช้ก็ได้" },
};

const STATUS_TONE: Record<CheckStatus, string> = {
  pass: "text-good",
  warn: "text-warn",
  fail: "text-bad",
  skip: "text-muted",
};

function scoreTone(n: number | null): string {
  if (n === null) return "text-muted";
  return n >= 80 ? "text-good" : n >= 60 ? "text-warn" : "text-bad";
}
const fmt = (n: number | null) => (n === null ? "—" : String(Math.round(n)));

/**
 * Optional second opinion on a recorded take: Azure's pronunciation scores, the take re-timed with Azure's word
 * boundaries (so `peakPlacement` can run), and the IPA layer. It only runs when the learner asks; the take is sent once.
 */
export function PronunciationCheck({
  voice,
  sentence,
  onScored,
}: {
  voice: VoiceAnalysis;
  sentence: Sentence;
  onScored?: (pronunciation: PronunciationScore, aligned: AlignedAnalysis | null) => void;
}) {
  const [state, setState] = useState<AzureCheckState>({ kind: "idle" });

  const run = async () => {
    setState({ kind: "running" });
    const next = await scoreWithAzure(voice, sentence);
    setState(next);
    if (next.kind === "ok") onScored?.(next.pronunciation, next.aligned);
  };

  if (state.kind === "ok") {
    return (
      <section aria-label="Pronunciation with Azure" className="flex flex-col gap-3">
        <PronunciationResult assessment={state.assessment} aligned={state.aligned} sentence={sentence} />
        <IpaLayer assessment={state.assessment} />
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn px-3 py-2 text-sm"
          onClick={() => void run()}
          disabled={state.kind === "running"}
        >
          {state.kind === "running" ? (
            <Bi text={{ en: "Checking sounds…", th: "กำลังตรวจเสียง…" }} inline className="flex-row! items-center gap-2" />
          ) : (
            <Bi text={{ en: "☁️ Check sounds with Azure (beta)", th: "☁️ ตรวจเสียงด้วย Azure (ทดลอง)" }} inline className="flex-row! items-center gap-2" />
          )}
        </button>
        <span className="text-xs text-muted">
          <Bi text={{ en: "Sends this take to Microsoft once. Optional.", th: "ส่งเทคนี้ให้ Microsoft หนึ่งครั้ง ไม่บังคับ" }} inline className="flex-row! gap-1" />
        </span>
      </div>
      {state.kind === "unconfigured" && (
        <p className="rounded-xl bg-accent-soft p-3 text-sm font-semibold">
          <Bi text={{ en: "Azure isn't set up, so the sound check is off. Everything else still works.", th: "ยังไม่ได้ตั้งค่า Azure การตรวจเสียงจึงปิดอยู่ ส่วนอื่นใช้ได้ตามปกติ" }} />
        </p>
      )}
      {(state.kind === "rate" || state.kind === "error") && (
        <p className="rounded-xl bg-warn-soft p-3 text-sm font-semibold text-warn">
          <Bi text={ERROR[state.kind]} />
          {state.kind === "error" && (
            <button type="button" className="ml-2 underline" onClick={() => void run()}>
              <Bi text={{ en: "Try again", th: "ลองใหม่" }} inline />
            </button>
          )}
        </p>
      )}
    </div>
  );
}

/** Scores, the monotone flag, the aligned peak check and a contour. */
function PronunciationResult({
  assessment,
  aligned,
  sentence,
}: {
  assessment: { accuracy: number | null; prosodyScore: number | null; pronScore: number | null; monotone: boolean };
  aligned: AlignedAnalysis | null;
  sentence: Sentence;
}) {
  const layout = useMemo(() => layoutSentence(sentence), [sentence]);
  const target = useMemo(() => targetContour(layout), [layout]);
  const peak = aligned?.groups.flatMap((g) => g.checks).find((c) => c.id === "peakPlacement") ?? null;
  const scores: [string, string, number | null][] = [
    ["Sounds", "เสียง", assessment.accuracy],
    ["Prosody", "ทำนอง", assessment.prosodyScore],
    ["Overall", "รวม", assessment.pronScore],
  ];
  return (
    <div className="card flex flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-extrabold">
          <Bi text={{ en: "Sounds and prosody", th: "เสียงและทำนอง" }} inline className="flex-row! items-baseline gap-2" />
        </h3>
        <span className="text-xs font-semibold text-muted">
          <Bi text={{ en: "Azure, beta", th: "Azure (ทดลอง)" }} inline />
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {scores.map(([en, th, v]) => (
          <div key={en} className="rounded-xl bg-accent-soft px-3 py-2 text-center">
            <div className={`text-xl font-black ${scoreTone(v)}`}>{fmt(v)}</div>
            <div className="text-xs text-muted">
              {en} <span className="thai">/ {th}</span>
            </div>
          </div>
        ))}
      </div>
      <p className={`rounded-xl p-3 text-sm font-semibold ${assessment.monotone ? "bg-bad-soft text-bad" : "bg-good-soft text-good"}`}>
        {assessment.monotone ? (
          <Bi text={{ en: "Your pitch stayed too flat.", th: "น้ำเสียงราบเรียบเกินไป ลองให้เสียงขึ้นลงมากขึ้น" }} />
        ) : (
          <Bi text={{ en: "Your pitch moved enough.", th: "น้ำเสียงขึ้นลงเพียงพอแล้ว" }} />
        )}
      </p>
      {peak && peak.status !== "skip" && (
        <p className={`rounded-xl p-3 text-sm font-semibold ${peak.status === "pass" ? "bg-good-soft text-good" : peak.status === "warn" ? "bg-warn-soft text-warn" : "bg-bad-soft text-bad"}`}>
          <span className="mr-1 font-black uppercase">{peak.status === "pass" ? "✓" : peak.status === "warn" ? "!" : "✗"}</span>
          <Bi text={peak.message} />
        </p>
      )}
      {aligned && (
        <div className="card overflow-hidden p-2">
          <ContourChart
            layout={layout}
            lines={[
              { contour: target, color: "var(--target)", dashed: true, width: 4 },
              { contour: aligned.aligned, color: "var(--learner)", width: 5 },
            ]}
            className="w-full"
          />
          <p className="px-2 pb-1 text-xs text-muted">
            <Bi
              text={{
                en: aligned.mode === "aligned" ? "Each syllable placed where Azure heard it." : "Some parts couldn't be timed, so the peak check covered the rest.",
                th: aligned.mode === "aligned" ? "วางแต่ละพยางค์ตามเวลาที่ Azure ได้ยิน" : "บางส่วนจับเวลาไม่ได้ จึงตรวจจุดสูงสุดได้เฉพาะส่วนที่เหลือ",
              }}
              inline
              className="flex-row! gap-1"
            />
          </p>
        </div>
      )}
      {aligned && aligned.warnings.length > 0 && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer font-bold">
            <Bi text={{ en: `Timing notes (${aligned.warnings.length})`, th: `หมายเหตุการจัดเวลา (${aligned.warnings.length})` }} inline />
          </summary>
          <ul className="mt-1 list-disc pl-5">
            {aligned.warnings.map((w, i) => (
              <li key={i}>
                <Bi text={w.message} />
              </li>
            ))}
          </ul>
        </details>
      )}
      {!aligned && (
        <p className="text-xs text-muted">
          <Bi text={{ en: "No pitch was found, so the peak position wasn't checked.", th: "ไม่พบเสียงสูงต่ำ จึงยังไม่ได้ตรวจตำแหน่งจุดสูงสุด" }} />
        </p>
      )}
      <p className="text-xs text-muted">
        <span className={`font-black ${STATUS_TONE[aligned ? "pass" : "skip"]}`} aria-hidden>
          ·
        </span>{" "}
        <Bi text={{ en: "The intonation score above still comes from our own engine.", th: "คะแนนทำนองด้านบนยังมาจากระบบของเราเอง" }} inline />
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
import type { AzureAssessment } from "@/lib/azure/parse";

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
function toneBg(score: number | null): string {
  if (score === null) return "bg-accent-soft text-muted";
  return score >= 80 ? "bg-good-soft text-good" : score >= 60 ? "bg-warn-soft text-warn" : "bg-bad-soft text-bad";
}
const fmt = (n: number | null) => (n === null ? "—" : String(Math.round(n)));

/** Optional "Score with Azure (beta)" button and a read-only result panel. Needs AZURE_SPEECH_KEY on the server. */
export function AzurePanel({ wav16k, referenceText }: { wav16k: Uint8Array; referenceText: string }) {
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
      {state.kind === "done" && <AzureResult a={state.result} />}
    </div>
  );
}

function AzureResult({ a }: { a: AzureAssessment }) {
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
      <ul className="mt-3 flex flex-wrap gap-2">
        {a.words.map((w, i) => {
          const ipa = w.syllables.length ? w.syllables.map((s) => s.ipa).join(".") : w.phonemes.map((p) => p.ipa).join("");
          return (
            <li key={i} className={`rounded-xl px-3 py-2 ${toneBg(w.accuracy)}`}>
              <div className="font-bold">{w.word}</div>
              <div className="font-ipa text-sm">/{ipa}/</div>
              <div className="text-xs">
                {fmt(w.accuracy)}
                {w.errorType !== "None" && w.errorType !== "Monotone" ? ` · ${w.errorType}` : ""}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {w.phonemes.map((p, j) => (
                  <span key={j} className={`font-ipa rounded px-1 text-xs ${toneBg(p.accuracy)}`} title={`${fmt(p.accuracy)}`}>
                    {p.ipa}
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

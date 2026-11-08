"use client";

import { useMemo, useState } from "react";
import { findFinalConsonantIssues, wordViews, type Band, type PhonemeView, type WordView } from "@/lib/azure/ipa";
import type { AzureAssessment } from "@/lib/azure/parse";

// Per-phoneme accuracy under every word. A band is never shown by colour alone: each one has its own icon, its own
// underline style (solid / dashed / wavy / dotted) and a text label for screen readers.

const BANDS: Record<Band, { icon: string; en: string; th: string; tone: string; line: string }> = {
  good: { icon: "✓", en: "Clear", th: "ชัด", tone: "text-good", line: "decoration-solid" },
  ok: { icon: "~", en: "Okay", th: "พอใช้", tone: "text-warn", line: "decoration-dashed" },
  poor: { icon: "✗", en: "Needs work", th: "ต้องปรับ", tone: "text-bad", line: "decoration-wavy" },
  unknown: { icon: "?", en: "No score", th: "ไม่มีคะแนน", tone: "text-muted", line: "decoration-dotted" },
};
const BAND_ORDER: Band[] = ["good", "ok", "poor"];
const RANGE: Record<Band, string> = { good: "80–100", ok: "60–79", poor: "0–59", unknown: "" };

const ERROR_LABEL: Record<string, { en: string; th: string }> = {
  Mispronunciation: { en: "Some sounds were off", th: "ออกเสียงบางตัวคลาดเคลื่อน" },
  Omission: { en: "Word skipped", th: "ข้ามคำนี้" },
  Insertion: { en: "Extra word", th: "คำที่เพิ่มเข้ามา" },
};

const fmt = (n: number | null) => (n === null ? "—" : String(Math.round(n)));

function Chip({ p }: { p: PhonemeView }) {
  const b = BANDS[p.band];
  return (
    <span className={`flex flex-col items-center px-0.5 ${b.tone}`}>
      <span className={`font-ipa pb-1 text-lg leading-6 text-ink underline decoration-2 underline-offset-4 ${b.line}`}>{p.expected}</span>
      <span aria-hidden className="text-xs font-black leading-3">
        {b.icon}
      </span>
      <span className="sr-only">
        {`${b.en}, ${fmt(p.accuracy)}`}
      </span>
    </span>
  );
}

function WordButton({ w, open, onToggle }: { w: WordView; open: boolean; onToggle: () => void }) {
  const b = BANDS[w.band];
  const flagged = w.finalIssues.length > 0;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={`ipa-detail-${w.index}`}
      className={`flex min-h-11 min-w-11 flex-col items-center gap-1 rounded-xl border-2 px-2 py-2 text-left transition-colors ${
        open ? "border-accent bg-accent-soft" : "border-line bg-card"
      }`}
    >
      <span className="flex items-center gap-1 font-bold">
        {w.word}
        {flagged && (
          <span aria-hidden className="text-sm text-bad" title="Final consonant">
            ⚠
          </span>
        )}
      </span>
      <span className="flex items-start gap-0.5">
        {w.phonemes.length > 0 ? (
          w.phonemes.map((p, i) => <Chip key={i} p={p} />)
        ) : (
          <span className={`text-xs font-bold ${b.tone}`}>
            <span aria-hidden>{b.icon} </span>
            {fmt(w.accuracy)}
          </span>
        )}
      </span>
      <span className="sr-only">
        {`Word score ${fmt(w.accuracy)}, ${b.en}.${flagged ? " Final consonant problem." : ""} Tap for details.`}
      </span>
    </button>
  );
}

function Detail({ w }: { w: WordView }) {
  const b = BANDS[w.band];
  const err = ERROR_LABEL[w.errorType];
  return (
    <div id={`ipa-detail-${w.index}`} className="rounded-2xl border-2 border-line p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="text-lg font-black">{w.word}</div>
        <div className={`text-sm font-extrabold ${b.tone}`}>
          <span aria-hidden>{b.icon} </span>
          {fmt(w.accuracy)} · {b.en} <span className="thai font-semibold">/ {b.th}</span>
        </div>
      </div>
      {err && (
        <p className="mt-1 text-sm text-muted">
          {err.en} <span className="thai">/ {err.th}</span>
        </p>
      )}
      {w.phonemes.length > 0 ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-accent-soft p-2">
              <div className="text-xs font-extrabold uppercase tracking-wide text-muted">Expected / ควรเป็น</div>
              <div className="font-ipa text-lg">/{w.expectedIpa}/</div>
            </div>
            <div className="rounded-xl bg-accent-soft p-2">
              <div className="text-xs font-extrabold uppercase tracking-wide text-muted">You said / ที่ได้ยิน</div>
              <div className="font-ipa text-lg">/{w.spokenIpa}/</div>
            </div>
          </div>
          <ul className="mt-3 flex flex-col divide-y divide-line text-sm">
            {w.phonemes.map((p, i) => {
              const pb = BANDS[p.band];
              return (
                <li key={i} className="grid grid-cols-[2rem_1fr_1fr_3rem] items-center gap-2 py-1.5">
                  <span aria-hidden className={`text-center font-black ${pb.tone}`}>
                    {pb.icon}
                  </span>
                  <span>
                    <span className="sr-only">Expected </span>
                    <span className="font-ipa text-base">/{p.expected}/</span>
                    {p.isFinal && p.isConsonant && <span className="ml-1 text-xs text-muted">final</span>}
                  </span>
                  <span className={p.matches ? "text-muted" : "font-bold"}>
                    <span className="sr-only">Heard </span>
                    {p.spoken === null ? "?" : <span className="font-ipa text-base">/{p.spoken}/</span>}
                    {!p.matches && <span className="ml-1 text-xs">≠</span>}
                  </span>
                  <span className={`text-right font-bold tabular-nums ${pb.tone}`}>
                    <span className="sr-only">{pb.en} </span>
                    {fmt(p.accuracy)}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">
          No sound-by-sound detail for this word. <span className="thai">ไม่มีรายละเอียดทีละเสียงสำหรับคำนี้</span>
        </p>
      )}
    </div>
  );
}

/** IPA under every word with per-phoneme accuracy; tap a word for expected vs spoken sounds. */
export function IpaLayer({ assessment }: { assessment: AzureAssessment }) {
  const words = useMemo(() => wordViews(assessment), [assessment]);
  const issues = useMemo(() => findFinalConsonantIssues(assessment), [assessment]);
  // Start with the weakest word open, if any word needs work.
  const [open, setOpen] = useState<number | null>(() => {
    let worst: WordView | null = null;
    for (const w of words) if (w.accuracy !== null && w.accuracy < 80 && (worst === null || w.accuracy < (worst.accuracy ?? 100))) worst = w;
    return worst ? worst.index : null;
  });
  const selected = words.find((w) => w.index === open) ?? null;

  if (words.length === 0) return null;
  return (
    <section aria-label="Sounds in each word" className="flex flex-col gap-3">
      <div>
        <h3 className="font-extrabold">
          Sounds <span className="thai font-semibold text-muted">/ เสียงในแต่ละคำ</span>
        </h3>
        <p className="text-sm text-muted">
          Tap a word to see what was expected and what Azure heard.
          <span className="thai block">แตะที่คำเพื่อดูเสียงที่ควรเป็นกับเสียงที่ Azure ได้ยิน</span>
        </p>
      </div>

      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" aria-label="Legend">
        {BAND_ORDER.map((k) => (
          <li key={k} className="flex items-center gap-1">
            <span className={`font-ipa pb-1 text-sm text-ink underline decoration-2 underline-offset-4 ${BANDS[k].line}`}>ə</span>
            <span className={`font-black ${BANDS[k].tone}`} aria-hidden>
              {BANDS[k].icon}
            </span>
            <span>
              {BANDS[k].en} {RANGE[k]} <span className="thai">/ {BANDS[k].th}</span>
            </span>
          </li>
        ))}
      </ul>

      <ul className="flex flex-wrap gap-2">
        {words.map((w) => (
          <li key={w.index}>
            <WordButton w={w} open={w.index === open} onToggle={() => setOpen(w.index === open ? null : w.index)} />
          </li>
        ))}
      </ul>

      {issues.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Final consonants">
          {issues.map((f) => (
            <li key={f.wordIndex} className="flex gap-2 rounded-xl bg-bad-soft p-3 text-sm font-semibold text-bad">
              <span aria-hidden>⚠</span>
              <span>
                {f.message.en}
                <span className="thai block font-normal">{f.message.th}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {selected && <Detail w={selected} />}
    </section>
  );
}

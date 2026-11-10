"use client";

import { useEffect, useMemo, useState } from "react";
import { layoutSentence, targetContour } from "@/lib/intonation/contour";
import { SENTENCES } from "@/lib/intonation/lessons";
import { ListenButton } from "@/components/learn/ListenButton";
import { DrawingPad } from "./DrawingPad";
import { SentenceView } from "./SentenceView";
import { VoicePanel, type SampleInfo } from "./VoicePanel";

type Mode = "draw" | "speak";

export function Lab() {
  const [id, setId] = useState(SENTENCES[0].id);
  const [mode, setMode] = useState<Mode>("draw");
  const [samples, setSamples] = useState<Record<string, SampleInfo[]>>({});
  const sentence = SENTENCES.find((s) => s.id === id) ?? SENTENCES[0];
  const layout = useMemo(() => layoutSentence(sentence), [sentence]);
  const target = useMemo(() => targetContour(layout), [layout]);

  useEffect(() => {
    fetch("/samples/index.json")
      .then((r) => (r.ok ? r.json() : {}))
      .then(setSamples)
      .catch(() => setSamples({}));
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-sm font-extrabold uppercase tracking-widest text-accent">Myna · Phase 0a lab</div>
          <h1 className="text-3xl font-black tracking-tight">Say it or draw it</h1>
        </div>
        <p className="max-w-sm text-sm text-muted">
          One rule engine grades both your voice and your drawing against the textbook pattern (levels 1–4).
        </p>
      </header>

      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Sentences">
        {SENTENCES.map((s) => (
          <button
            key={s.id}
            onClick={() => setId(s.id)}
            className={`btn shrink-0 px-3 py-2 text-sm ${s.id === id ? "btn-primary" : ""}`}
            aria-pressed={s.id === id}
          >
            {s.kind}
          </button>
        ))}
      </nav>

      <section className="card flex flex-col gap-4 p-4 sm:p-6">
        <SentenceView sentence={sentence} />
        <div className="rounded-xl bg-accent-soft p-3 text-sm">
          <div className="font-bold text-accent">{sentence.note.en}</div>
          <div className="thai text-accent">{sentence.note.th}</div>
        </div>
        <ListenButton key={sentence.id} sentence={sentence} label={{ en: "Hear the model", th: "ฟังเสียงต้นแบบ" }} />
      </section>

      <div className="flex gap-2" role="tablist">
        {(["draw", "speak"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`btn flex-1 ${mode === m ? "btn-accent" : ""}`}
          >
            {m === "draw" ? "✏️ Draw it" : "🗣️ Say it"}
          </button>
        ))}
      </div>

      <section key={`${sentence.id}-${mode}`}>
        {mode === "draw" ? (
          <DrawingPad sentence={sentence} layout={layout} target={target} />
        ) : (
          <VoicePanel sentence={sentence} layout={layout} target={target} samples={samples[sentence.id] ?? []} />
        )}
      </section>

      <footer className="pt-4 text-xs text-muted">
        Phase 0a: no Azure yet, so for voice the “peak position” check is skipped and time is stretched per thought
        group. Thresholds are first guesses — tune them with real recordings.
      </footer>
    </main>
  );
}

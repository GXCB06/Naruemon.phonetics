"use client";

import { useEffect, useState } from "react";
import { useAiEnabled } from "@/components/ai/useAiEnabled";
import { Bi, useLang } from "@/components/home/lang";
import type { AskAbout } from "@/lib/ai/askMyna";
import type { Sentence } from "@/lib/intonation/types";
import { AskMyna } from "./AskMyna";

/**
 * "Why?" on the result sheet after a wrong answer: opens Ask Myna, which explains straight away why the course answer is
 * right. Hidden when the server has no AI key.
 */
export function WhyButton({ sentence, exercise }: { sentence: Sentence; exercise: Exclude<AskAbout, "draw"> }) {
  const on = useAiEnabled("/api/ask-myna");
  const [open, setOpen] = useState(false);
  const lang = useLang();
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  if (!on) return null;
  const first = lang === "th" ? "ทำไมคำตอบที่ถูกถึงเป็นแบบนี้" : "Why is the correct answer right?";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1.5 rounded-xl border-2 border-current/30 px-3 py-1.5 text-sm font-extrabold hover:bg-current/10"
      >
        <span aria-hidden>💬</span>
        <Bi text={{ en: "Why? Ask Myna", th: "ทำไม? ถาม Myna" }} inline className="flex-row! items-baseline gap-1.5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40 sm:items-center sm:justify-center" role="dialog" aria-label="Ask Myna" onClick={() => setOpen(false)}>
          <div
            className="sheet-up max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-ink sm:max-w-lg sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end">
              <button type="button" className="flex size-10 items-center justify-center rounded-full text-2xl font-black text-muted hover:bg-line" aria-label="Close" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
            <AskMyna sentence={sentence} about={exercise} firstQuestion={first} />
          </div>
        </div>
      )}
    </>
  );
}

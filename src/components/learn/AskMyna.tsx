"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AI_ERROR, aiErrorFor, type AiError } from "@/components/ai/useAiEnabled";
import { MynaBot, type BotMood } from "@/components/mascot/MynaBot";
import type { Bilingual } from "@/lib/intonation/types";
import { drawGroupsOf, syllableLabel, type DrawGrade, type Levels } from "@/lib/learn/tuneDraw";
import type { Sentence } from "@/lib/intonation/types";
import type { AskAbout } from "@/lib/ai/askMyna";

interface Turn {
  role: "user" | "assistant";
  /** What is sent back to the server: the question, or the answer as the JSON Claude returned. */
  content: string;
  answer?: Bilingual;
}

/**
 * Ask Melobi: the student asks "why?" about this sentence and their own line, in English or Thai, and gets a short
 * answer in both. The server builds the prompt from the course sentence and the drawing (src/app/api/ask-myna).
 */
export function AskMyna({
  sentence,
  assigned = [],
  grade = "miss",
  about = "draw",
  firstQuestion,
}: {
  sentence: Sentence;
  /** The learner's drawing (draw only). */
  assigned?: (Levels | null)[];
  grade?: DrawGrade;
  /** Which exercise this is about; anything but "draw" sends no answer data. */
  about?: AskAbout;
  /** Asked straight away when the panel opens ("Why?" after a wrong answer). */
  firstQuestion?: string;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AiError | null>(null);
  const [mood, setMood] = useState<BotMood>("idle");
  const [draft, setDraft] = useState("");
  const ctl = useRef<AbortController | null>(null);
  const moodTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const chips = useMemo(() => {
    const groups = drawGroupsOf(sentence);
    const last = groups[groups.length - 1];
    const nuc = syllableLabel(last, last.nucleus);
    const peak = { en: `Why is the peak on ${nuc}?`, th: `ทำไมเสียงสูงอยู่ที่ ${nuc}` };
    const end = { en: "Why does it end like this?", th: "ทำไมตอนจบเป็นแบบนี้" };
    if (about !== "draw") return [peak, end, { en: "How can I hear the difference?", th: "ฟังความต่างได้ยังไง" }];
    if (grade === "miss") return [{ en: "Why is my line wrong?", th: "ทำไมเส้นของฉันผิด" }, peak, { en: "How can I hear the difference?", th: "ฟังความต่างได้ยังไง" }];
    if (grade === "good") return [{ en: "How do I get a Perfect?", th: "ทำยังไงให้ได้ Perfect" }, peak, end];
    return [peak, end, { en: "When else do we use this tune?", th: "ใช้ทำนองนี้ตอนไหนอีก" }];
  }, [sentence, grade, about]);

  const react = (m: BotMood) => {
    clearTimeout(moodTimer.current);
    setMood(m);
    moodTimer.current = setTimeout(() => setMood("idle"), 1800);
  };

  const ask = async (question: string) => {
    const q = question.trim().slice(0, 300);
    if (!q || pending) return;
    const next: Turn[] = [...turns, { role: "user", content: q }];
    setTurns(next);
    setPending(true);
    setError(null);
    setMood("thinking");
    ctl.current = new AbortController();
    // the server keeps nothing: send the last few turns, starting with a question
    const recent = next.slice(-7);
    while (recent.length && recent[0].role !== "user") recent.shift();
    try {
      const res = await fetch("/api/ask-myna", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentenceId: sentence.id, assigned: about === "draw" ? assigned : [], about, turns: recent.map((t) => ({ role: t.role, content: t.content })) }),
        signal: ctl.current.signal,
      });
      if (!res.ok) {
        setError(aiErrorFor(res.status));
        react("sad");
        return;
      }
      const { answer } = (await res.json()) as { answer: Bilingual };
      setTurns((t) => [...t, { role: "assistant", content: JSON.stringify(answer), answer }]);
      react("wink");
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError("offline");
        react("sad");
      } else setMood("idle");
    } finally {
      setPending(false);
      ctl.current = null;
    }
  };

  useEffect(() => {
    if (!firstQuestion) return;
    // a tick later, so a dev-mode remount cancels the first one instead of aborting a request in flight
    const t = setTimeout(() => void ask(firstQuestion), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the panel opens
  }, []);
  useEffect(() => () => ctl.current?.abort(), []);

  return (
    <section id="ask-myna" className="mt-4 scroll-mt-3 rounded-2xl border-2 border-accent p-4" aria-labelledby="ask-title">
      <div className="flex items-center gap-3">
        <MynaBot mood={mood} className="h-12 w-12" />
        <h3 id="ask-title" className="text-lg font-black">
          Ask Melobi<span className="thai block text-sm font-semibold text-muted">ถาม Melobi ครูผู้ช่วย AI</span>
        </h3>
      </div>
      {about === "draw" ? (
        <p className="mt-2 text-sm font-bold text-muted">
          Still not sure why? Ask about this sentence and your line, in English or Thai.
          <span className="thai block font-medium">ยังไม่เข้าใจ? ถามเกี่ยวกับประโยคนี้และเส้นของคุณได้ ทั้งภาษาอังกฤษและภาษาไทย</span>
        </p>
      ) : (
        <p className="mt-2 text-sm font-bold text-muted">
          Ask anything about this sentence&apos;s tune, in English or Thai.
          <span className="thai block font-medium">ถามเรื่องทำนองเสียงของประโยคนี้ได้ ทั้งภาษาอังกฤษและภาษาไทย</span>
        </p>
      )}

      {(turns.length > 0 || pending) && (
        <div className="mt-3 flex flex-col gap-2.5" aria-live="polite">
          {turns.map((t, k) =>
            t.role === "user" ? (
              <p key={k} className="max-w-[88%] self-end rounded-2xl rounded-br-md bg-accent px-3.5 py-2.5 font-bold text-white">
                {t.content}
              </p>
            ) : (
              <div key={k} className="max-w-[88%] self-start rounded-2xl rounded-bl-md bg-bg px-3.5 py-2.5 font-semibold leading-snug">
                {t.answer?.en}
                <span className="thai mt-1.5 block text-sm font-medium text-muted">{t.answer?.th}</span>
              </div>
            ),
          )}
          {pending && (
            <p className="self-start rounded-2xl rounded-bl-md bg-bg px-3.5 py-2.5 text-sm font-extrabold text-muted">
              Melobi is thinking… <span className="thai font-medium">กำลังคิด…</span>
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((c) => (
          <button key={c.en} type="button" className="btn flex-col items-start gap-0 px-3 py-1.5 text-left text-sm" disabled={pending} onClick={() => ask(c.en)}>
            {c.en}
            <span className="thai text-xs font-medium text-muted">{c.th}</span>
          </button>
        ))}
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = draft;
          setDraft("");
          void ask(v);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={300}
          enterKeyHint="send"
          placeholder="Type a question… · พิมพ์คำถาม…"
          aria-label="Your question for Melobi"
          className="min-h-12 min-w-0 flex-1 rounded-xl border-2 border-line bg-card px-3 font-bold text-ink outline-none focus:border-accent"
        />
        {pending ? (
          <button type="button" className="btn h-12 w-12 p-0" aria-label="Stop" onClick={() => ctl.current?.abort()}>
            ■
          </button>
        ) : (
          <button type="submit" className="btn btn-accent h-12 w-12 p-0 text-lg" aria-label="Send" disabled={!draft.trim()}>
            ↑
          </button>
        )}
      </form>

      {error && (
        <p className="mt-2 text-sm font-extrabold text-bad">
          {AI_ERROR[error].en}
          <span className="thai block font-medium text-muted">{AI_ERROR[error].th}</span>
        </p>
      )}
      <p className="mt-2 text-xs font-bold text-muted">
        {about === "draw" ? "Melobi is AI and can make mistakes. The green line is the course answer." : "Melobi is AI and can make mistakes. The answer in green is the course answer."}
        <span className="thai block font-medium">
          {about === "draw" ? "Melobi เป็น AI อาจตอบผิดได้ เส้นสีเขียวคือคำตอบตามบทเรียน" : "Melobi เป็น AI อาจตอบผิดได้ คำตอบสีเขียวคือคำตอบตามบทเรียน"}
        </span>
      </p>
    </section>
  );
}

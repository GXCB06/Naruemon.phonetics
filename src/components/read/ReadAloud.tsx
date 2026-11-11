"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAiEnabled } from "@/components/ai/useAiEnabled";
import { Bi, useLang } from "@/components/home/lang";
import { TopBar } from "@/components/home/TopBar";
import { useProgress } from "@/components/home/useProgress";
import { speakWord } from "@/components/ipa/useIpaSound";
import { playResult } from "@/components/learn/chime";
import { setSlow, useSlow } from "@/components/learn/slow";
import { SpeakerIcon } from "@/components/learn/ui";
import { MynaBot } from "@/components/mascot/MynaBot";
import { MicCheckButton } from "@/components/mic/MicCheckButton";
import { MicGateDialog } from "@/components/mic/MicGateDialog";
import { loadMicProfile } from "@/components/mic/micProfile";
import { micGate, type GateReason } from "@/lib/audio/micProfile";
import type { AzureAssessment } from "@/lib/azure/parse";
import { overallWord, readReport, type ReadReport, type WordBand } from "@/lib/read/score";
import { distinctKeys, readableSentences, tokenize, type SentenceSpan, type Token } from "@/lib/read/text";
import { speechRate } from "@/lib/learn/slow";
import { speakSentence } from "./tts";
import { useReadScore } from "./useReadScore";

const SAMPLES: { id: string; title: { en: string; th: string }; text: string }[] = [
  {
    id: "cafe",
    title: { en: "At the café", th: "ที่ร้านกาแฟ" },
    text: "Good morning! Would you like coffee or tea? I'd like a cup of coffee, please. Is that all? Yes, thank you.",
  },
  {
    id: "intro",
    title: { en: "Introducing yourself", th: "แนะนำตัว" },
    text: "Hi, my name is Mali. I am a student at Chulalongkorn University. I like playing football, tennis, and volleyball.",
  },
  {
    id: "weekend",
    title: { en: "Weekend plans", th: "แผนวันหยุด" },
    text: "If it rains on Saturday, we will stay home. Otherwise, we are going to the market. Do you want to come with us?",
  },
];

const BAND_CLASS: Record<WordBand, string> = {
  good: "text-good",
  ok: "text-warn",
  poor: "text-bad underline decoration-2 underline-offset-4",
  unknown: "",
  omitted: "text-muted line-through decoration-2",
};

type Load = "idle" | "loading" | "ready" | "error";
interface IpaMap {
  [key: string]: { ipa: string | null };
}

/** The text of a word chip: the word with the punctuation that follows it ("morning,"). */
function pieces(sentence: string, tokens: readonly Token[]): string[] {
  return tokens.map((t, i) => sentence.slice(i === 0 ? 0 : t.start, tokens[i + 1]?.start ?? sentence.length).trim());
}

/**
 * Read aloud: paste English text (or pick one), see each sentence with the IPA of every word, hear it read with each word
 * lit as it is said, tap any word for its sounds, and read a sentence yourself to get it scored word by word.
 */
export function ReadAloud() {
  const { progress, streak } = useProgress();
  const lang = useLang();
  const aiOn = useAiEnabled("/api/translate");

  const [draft, setDraft] = useState("");
  const [sentences, setSentences] = useState<SentenceSpan[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [ipa, setIpa] = useState<IpaMap | null>(null);
  const [ipaLoad, setIpaLoad] = useState<Load>("idle");
  const [showIpa, setShowIpa] = useState(true);
  const [thai, setThai] = useState<string[] | null>(null);
  const [thaiLoad, setThaiLoad] = useState<Load>("idle");
  const [showThai, setShowThai] = useState(false);
  const slow = useSlow();
  const [playing, setPlaying] = useState<{ i: number; word: number } | null>(null);
  const [picked, setPicked] = useState<{ i: number; j: number } | null>(null);
  const [reports, setReports] = useState<Record<number, ReadReport>>({});
  const [gate, setGate] = useState<{ reason: GateReason; i: number } | null>(null);
  const stopSpeech = useRef<(() => void) | null>(null);

  const tokensBySentence = useMemo(() => (sentences ?? []).map((s) => tokenize(s.text)), [sentences]);
  const tokensRef = useRef(tokensBySentence);
  useEffect(() => {
    tokensRef.current = tokensBySentence;
  });
  const score = useReadScore((i, assessment: AzureAssessment) => {
    const report = readReport(tokensRef.current[i] ?? [], assessment);
    setReports((r) => ({ ...r, [i]: report }));
    playResult((report.overall ?? 0) >= 70, { combo: 1, perfect: (report.overall ?? 0) >= 90 }); // best effort: the result arrives after the tap
  });

  useEffect(() => () => stopSpeech.current?.(), []);

  const begin = async (text: string) => {
    const r = readableSentences(text);
    if (r.sentences.length === 0) return;
    stopSpeech.current?.();
    setSentences(r.sentences);
    setTruncated(r.truncated);
    setReports({});
    setPicked(null);
    setPlaying(null);
    setThai(null);
    setThaiLoad("idle");
    score.reset();
    // the IPA comes from the server (the dictionary is big); the page works without it
    setIpa(null);
    setIpaLoad("loading");
    try {
      const keys = distinctKeys(r.sentences.map((s) => s.text).join(" "), 300);
      const res = await fetch("/api/read-text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keys }) });
      if (!res.ok) throw new Error(String(res.status));
      setIpa(((await res.json()) as { words: IpaMap }).words);
      setIpaLoad("ready");
    } catch {
      setIpaLoad("error");
    }
  };

  const loadThai = async () => {
    if (!sentences || thaiLoad === "loading") return;
    setThaiLoad("loading");
    try {
      const res = await fetch("/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sentences: sentences.map((s) => s.text) }) });
      if (!res.ok) throw new Error(String(res.status));
      setThai(((await res.json()) as { th: string[] }).th);
      setThaiLoad("ready");
    } catch {
      setThaiLoad("error");
    }
  };

  const toggleThai = () => {
    const next = !showThai;
    setShowThai(next);
    if (next && thai === null) void loadThai();
  };

  const listen = (i: number) => {
    stopSpeech.current?.();
    const s = sentences![i];
    setPlaying({ i, word: -1 });
    stopSpeech.current = speakSentence(s.text, tokensBySentence[i], {
      rate: speechRate("sentence", slow),
      onWord: (word) => setPlaying({ i, word }),
      onEnd: () => setPlaying((p) => (p?.i === i ? null : p)),
    });
  };

  const readIt = (i: number) => {
    stopSpeech.current?.();
    setPlaying(null);
    const d = micGate(loadMicProfile(), null, Date.now());
    if (d.need && d.reason) setGate({ reason: d.reason, i });
    else void score.start(sentences![i].text, i);
  };

  const tapWord = (i: number, j: number) => {
    setPicked({ i, j });
    speakWord(tokensBySentence[i][j].text, speechRate("word", slow));
  };

  // ---------------------------------------------------------------------------------------------------------
  const header = (
    <div className="flex items-center gap-3">
      <MynaBot mood={playing ? "happy" : score.phase === "recording" ? "listening" : "wink"} className="size-16 shrink-0" />
      <div className="min-w-0">
        <h1 className="text-3xl font-black tracking-tight">
          <Bi text={{ en: "Read aloud", th: "อ่านออกเสียง" }} />
        </h1>
        <p className="text-sm font-semibold text-muted">
          <Bi text={{ en: "Hear it, see its sounds, then read it yourself.", th: "ฟัง ดูเสียง แล้วลองอ่านเอง" }} subClassName="hidden" />
        </p>
      </div>
    </div>
  );

  if (!sentences) {
    return (
      <>
        <TopBar progress={progress} streak={streak} />
        <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 pb-6 pt-4">
          {header}
          <label className="flex flex-col gap-2">
            <span className="text-sm font-black uppercase tracking-wider text-muted">
              <Bi text={{ en: "Paste English text", th: "วางข้อความภาษาอังกฤษ" }} />
            </span>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              maxLength={2000}
              placeholder={lang === "th" ? "วางหรือพิมพ์ข้อความที่นี่…" : "Paste or type some English here…"}
              className="min-h-40 w-full resize-y rounded-2xl border-2 border-line bg-card px-4 py-3 text-lg font-semibold leading-relaxed text-ink placeholder:text-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </label>
          <button type="button" className="btn btn-accent w-full py-4 text-lg tracking-wide" disabled={!/[A-Za-z]/.test(draft)} onClick={() => void begin(draft)}>
            <Bi text={{ en: "START READING", th: "เริ่มอ่าน" }} className="items-center leading-tight" subClassName="text-white/80" />
          </button>
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-black uppercase tracking-wider text-muted">
              <Bi text={{ en: "Or try one", th: "หรือลองอันนี้" }} />
            </h2>
            {SAMPLES.map((s) => (
              <button key={s.id} type="button" onClick={() => void begin(s.text)} className="pick flex flex-col items-start gap-1 px-4 py-3 text-left">
                <span className="font-black">
                  <Bi text={s.title} inline className="flex-row! items-baseline gap-2" />
                </span>
                <span className="text-sm font-semibold text-muted">{s.text}</span>
              </button>
            ))}
          </section>
        </main>
      </>
    );
  }

  const toggle = (on: boolean, onClick: () => void, label: { en: string; th: string }, disabled = false) => (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`pick px-4 py-2 text-sm font-extrabold ${on ? "is-on" : ""} disabled:opacity-40`}
    >
      <Bi text={label} className="items-center leading-tight" />
    </button>
  );

  return (
    <>
      <TopBar progress={progress} streak={streak} />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 pb-6 pt-4">
        {header}

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Options · ตัวเลือก">
          {toggle(showIpa, () => setShowIpa((v) => !v), { en: "IPA", th: "IPA" }, ipaLoad !== "ready")}
          {aiOn && toggle(showThai, toggleThai, { en: "ไทย", th: "แปลไทย" })}
          {toggle(slow, () => setSlow(!slow), { en: "🐢 Slow", th: "🐢 ช้า" })}
          <button type="button" className="ml-auto rounded-xl px-3 py-2 text-sm font-extrabold uppercase tracking-wide text-muted hover:bg-line" onClick={() => setSentences(null)}>
            <Bi text={{ en: "New text", th: "ข้อความใหม่" }} className="items-center" />
          </button>
        </div>

        {ipaLoad === "loading" && <p className="text-sm font-bold text-muted">{lang === "th" ? "กำลังหา IPA…" : "Looking up the sounds…"}</p>}
        {ipaLoad === "error" && (
          <p className="rounded-xl bg-warn-soft p-3 text-sm font-semibold text-warn" role="status">
            <Bi text={{ en: "Couldn't load the IPA just now. You can still listen and read.", th: "โหลด IPA ไม่ได้ตอนนี้ แต่ยังฟังและอ่านได้" }} />
          </p>
        )}
        {thaiLoad === "loading" && <p className="text-sm font-bold text-muted">{lang === "th" ? "กำลังแปล…" : "Translating…"}</p>}
        {thaiLoad === "error" && (
          <p className="rounded-xl bg-warn-soft p-3 text-sm font-semibold text-warn" role="status">
            <Bi text={{ en: "Couldn't translate just now. Try again in a minute.", th: "แปลไม่ได้ตอนนี้ ลองใหม่อีกครั้งในอีกสักครู่" }} />
          </p>
        )}
        {truncated && (
          <p className="rounded-xl bg-accent-soft p-3 text-sm font-semibold text-accent" role="status">
            <Bi text={{ en: "That was a long text, so I took the first part. Paste the rest next.", th: "ข้อความยาว จึงใช้ส่วนแรก วางส่วนที่เหลือต่อได้เลย" }} />
          </p>
        )}

        <ol className="flex flex-col gap-4" data-sfx="none">
          {sentences.map((s, i) => {
            const tokens = tokensBySentence[i];
            const chips = pieces(s.text, tokens);
            const report = reports[i];
            const live = playing?.i === i ? playing.word : -1;
            const mine = score.active === i;
            const recording = mine && score.phase === "recording";
            return (
              <li key={i} className="card flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-end gap-x-2 gap-y-3" aria-label={s.text}>
                  {tokens.map((t, j) => {
                    const w = report?.words[j];
                    const entry = ipa?.[t.key];
                    const isLive = live === j;
                    const isPicked = picked?.i === i && picked.j === j;
                    return (
                      <button
                        key={j}
                        type="button"
                        onClick={() => tapWord(i, j)}
                        aria-label={`${t.text}${entry?.ipa ? `, /${entry.ipa}/` : ""}`}
                        aria-pressed={isPicked}
                        className={`flex flex-col items-start rounded-xl px-1.5 py-1 text-left transition-colors ${isLive ? "bg-primary text-primary-ink" : isPicked ? "bg-accent-soft" : "hover:bg-line/60"}`}
                      >
                        <span className={`text-xl font-black leading-tight sm:text-2xl ${w ? BAND_CLASS[w.band] : ""}`}>{chips[j]}</span>
                        {showIpa && ipaLoad === "ready" && <span className="ipa text-sm font-semibold text-muted">{entry?.ipa ? `/${entry.ipa}/` : "·"}</span>}
                      </button>
                    );
                  })}
                </div>

                {showThai && (
                  <p className="thai rounded-xl bg-accent-soft px-3 py-2 text-base font-semibold text-ink">
                    {thai?.[i] ?? (thaiLoad === "loading" ? "…" : "")}
                  </p>
                )}

                {picked?.i === i && (
                  <div className="pop-in flex flex-wrap items-center gap-3 rounded-xl bg-accent-soft px-3 py-2" role="status">
                    <span className="text-lg font-black">{tokens[picked.j].text}</span>
                    {ipa?.[tokens[picked.j].key]?.ipa ? (
                      <span className="ipa text-lg font-bold text-accent">/{ipa[tokens[picked.j].key].ipa}/</span>
                    ) : (
                      <span className="text-sm font-semibold text-muted">{lang === "th" ? "ไม่มี IPA ของคำนี้" : "No IPA for this word"}</span>
                    )}
                    {report?.words[picked.j]?.mismatches.length ? (
                      <span className="text-sm font-bold text-bad">
                        {lang === "th" ? "คุณพูดเป็น" : "You said"} /{report.words[picked.j].spokenIpa}/
                      </span>
                    ) : null}
                    <button type="button" className="ml-auto rounded-lg px-2 py-1 text-sm font-extrabold text-accent hover:bg-line/60" onClick={() => speakWord(tokens[picked.j].text, speechRate("word", slow))}>
                      <SpeakerIcon className="mr-1 inline size-5" /> <Bi text={{ en: "Again", th: "อีกครั้ง" }} inline className="flex-row! gap-1" />
                    </button>
                  </div>
                )}

                {/* the two ways to practise this sentence */}
                {recording ? (
                  <button type="button" className="btn btn-bad w-full flex-col gap-1 py-4 text-lg" onClick={() => void score.stop()} aria-label={`Stop recording (${score.elapsed.toFixed(1)} seconds)`}>
                    <span className="flex h-7 items-end gap-1" aria-hidden>
                      {[0, 1, 2, 3, 4, 5, 6].map((k) => (
                        <span key={k} className="w-1.5 rounded-full bg-white transition-[height] duration-100" style={{ height: `${18 + 82 * score.level * (0.55 + 0.45 * Math.abs(Math.sin(score.elapsed * 7 + k * 0.9)))}%` }} />
                      ))}
                    </span>
                    <Bi text={{ en: `Tap to stop · ${score.elapsed.toFixed(1)}s`, th: "แตะเพื่อหยุด" }} className="items-center leading-tight" subClassName="text-white/80" />
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" className="pick flex min-h-14 items-center justify-center gap-2 px-3" onClick={() => (live >= 0 || playing?.i === i ? (stopSpeech.current?.(), setPlaying(null)) : listen(i))}>
                      <SpeakerIcon className="size-7" on={playing?.i === i} />
                      <Bi text={playing?.i === i ? { en: "Stop", th: "หยุด" } : { en: "Listen", th: "ฟัง" }} className="font-extrabold" />
                    </button>
                    <button
                      type="button"
                      className="pick flex min-h-14 items-center justify-center gap-2 px-3 disabled:opacity-40"
                      onClick={() => readIt(i)}
                      disabled={s.long || (score.phase !== "idle" && score.phase !== "done" && score.phase !== "error")}
                    >
                      <svg viewBox="0 0 24 24" className="size-7" aria-hidden fill="currentColor">
                        <rect x="9" y="3" width="6" height="11" rx="3" />
                        <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      <Bi text={report ? { en: "Read again", th: "อ่านอีกครั้ง" } : { en: "Read it", th: "อ่านเอง" }} className="font-extrabold" />
                    </button>
                  </div>
                )}
                {s.long && (
                  <p className="text-xs font-semibold text-muted">
                    <Bi text={{ en: "This sentence is too long to score in one go. You can still listen to it.", th: "ประโยคนี้ยาวเกินไปที่จะให้คะแนนรอบเดียว แต่ยังฟังได้" }} />
                  </p>
                )}

                {mine && score.phase === "scoring" && (
                  <p className="font-bold text-muted" role="status">
                    <Bi text={{ en: "Scoring…", th: "กำลังให้คะแนน…" }} />
                  </p>
                )}
                {mine && score.phase === "starting" && (
                  <p className="font-bold text-muted" role="status">
                    <Bi text={{ en: "Opening the mic…", th: "กำลังเปิดไมค์…" }} />
                  </p>
                )}
                {mine && score.phase === "error" && score.error && (
                  <div className="rounded-xl bg-bad-soft p-3 text-sm font-semibold text-bad" role="alert">
                    <Bi text={score.error} />
                    <MicCheckButton className="mt-3" />
                  </div>
                )}
                {mine && score.micChanged && score.phase !== "recording" && (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl bg-warn-soft p-3 text-sm font-semibold text-warn" role="status">
                    <Bi text={{ en: "This looks like a different microphone. A quick check keeps your score fair.", th: "ดูเหมือนเป็นไมค์คนละตัว เช็กสั้น ๆ เพื่อให้คะแนนยุติธรรม" }} className="min-w-0 flex-1" />
                    <MicCheckButton />
                  </div>
                )}

                {report && <ScoreCard report={report} onHear={(word) => speakWord(word, speechRate("word", slow))} />}
              </li>
            );
          })}
        </ol>

        <MicGateDialog
          open={gate !== null}
          reason={gate?.reason ?? "never"}
          onContinue={() => {
            const i = gate?.i ?? 0;
            setGate(null);
            void score.start(sentences[i].text, i); // inside the tap: the microphone opens here
          }}
        />
      </main>
    </>
  );
}

/** The result of one read: a score, three small numbers, and the sounds to fix. */
function ScoreCard({ report, onHear }: { report: ReadReport; onHear: (word: string) => void }) {
  const lang = useLang();
  const tone = report.overall === null ? "text-ink" : report.overall >= 80 ? "text-good" : report.overall >= 60 ? "text-warn" : "text-bad";
  const stat = (label: { en: string; th: string }, v: number | null) =>
    v === null ? null : (
      <div key={label.en} className="flex flex-col items-center rounded-xl bg-bg px-3 py-1.5 text-center">
        <span className="text-lg font-black tabular-nums">{v}</span>
        <span className="text-[0.7rem] font-extrabold uppercase tracking-wide text-muted">{lang === "th" ? label.th : label.en}</span>
      </div>
    );
  return (
    <section className="pop-in flex flex-col gap-3 border-t-2 border-line pt-3" aria-label="Your reading · ผลการอ่านของคุณ">
      <div className="flex items-center gap-3">
        <p className={`text-4xl font-black tabular-nums leading-none ${tone}`}>
          {report.overall ?? "–"}
          <span className="text-lg text-muted">/100</span>
        </p>
        <p className="font-black">
          <Bi text={overallWord(report.overall)} />
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {stat({ en: "Accuracy", th: "ความถูกต้อง" }, report.accuracy)}
        {stat({ en: "Fluency", th: "ความลื่นไหล" }, report.fluency)}
        {stat({ en: "Complete", th: "ครบถ้วน" }, report.completeness)}
        {stat({ en: "Tune", th: "ทำนอง" }, report.prosody)}
      </div>
      {report.monotone && (
        <p className="rounded-xl bg-warn-soft p-3 text-sm font-semibold text-warn">
          <Bi text={{ en: "Your pitch stayed too flat. Let your voice rise and fall.", th: "น้ำเสียงราบเรียบเกินไป ลองให้เสียงขึ้นลงมากขึ้น" }} />
        </p>
      )}
      {report.fixes.length === 0 ? (
        <p className="rounded-xl bg-good-soft p-3 text-sm font-bold text-good">
          <Bi text={{ en: "Every word came through clearly.", th: "ทุกคำชัดเจนดี" }} />
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-black uppercase tracking-wider text-muted">
            <Bi text={{ en: "Sounds to fix", th: "เสียงที่ควรแก้" }} />
          </h3>
          <ul className="flex flex-col gap-2">
            {report.fixes.map((f) => (
              <li key={f.tokenIndex} className="flex items-start gap-3 rounded-xl border-2 border-line p-3">
                <span aria-hidden className={`mt-1 size-3 shrink-0 rounded-full ${f.band === "poor" || f.band === "omitted" ? "bg-bad" : "bg-warn"}`} />
                <span className="min-w-0 flex-1 text-sm font-semibold">
                  <Bi text={f.message} subClassName="text-muted" />
                  {f.expectedIpa && f.spokenIpa && f.band !== "omitted" && (
                    <span className="ipa mt-1 block text-xs text-muted">
                      {lang === "th" ? "ควรเป็น" : "Should be"} /{f.expectedIpa}/ · {lang === "th" ? "ได้ยินเป็น" : "heard"} /{f.spokenIpa}/
                    </span>
                  )}
                </span>
                <button type="button" aria-label={`Hear “${f.word}”`} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent" onClick={() => onHear(f.word)}>
                  <SpeakerIcon className="size-6" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

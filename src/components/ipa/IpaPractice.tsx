"use client";

import { Immersive } from "@/components/nav/TabBar";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { playResult } from "@/components/learn/chime";
import { MynaBot, type BotMood } from "@/components/mascot/MynaBot";
import {
  CONSONANTS,
  gradeIpa,
  parseFocus,
  pickRoundWords,
  practiceWords,
  seededRandom,
  STRESS,
  tileBank,
  VOWELS,
  type IpaResult,
  type PracticeWord,
} from "@/lib/ipa/practice";
import { recordIpaAttempt } from "@/lib/attempts";
import { AI_ERROR, aiErrorFor, useAiEnabled, type AiError } from "@/components/ai/useAiEnabled";
import { parseIpa } from "@/lib/ipa/practice";
import { keyWordParts } from "@/lib/ipa/sounds";
import { speakWord, useIpaSound } from "./useIpaSound";
import { WritePad, type WritePadHandle } from "./WritePad";

const ROUND = 8;
type Mode = "build" | "write";
interface Placed {
  sym: string;
  /** Index in the tile bank (Build), or null when typed with the symbol keyboard (Write). */
  bank: number | null;
}
interface Tally {
  perfect: number;
  good: number;
  miss: number;
}

const TITLE = {
  perfect: { en: "Perfect!", th: "สมบูรณ์แบบ!" },
  good: { en: "Good!", th: "ดีมาก!" },
  miss: { en: "Not quite. Try again next time!", th: "ยังไม่ใช่ ครั้งหน้าลองใหม่นะ" },
};


function Tile({ sym, state, ghost, onClick, disabled, small }: { sym: string; state?: "good" | "bad"; ghost?: boolean; onClick?: () => void; disabled?: boolean; small?: boolean }) {
  const tone = state === "bad" ? "border-bad bg-bad-soft" : state === "good" ? "border-good bg-good-soft" : "border-line bg-card";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={sym === STRESS ? "stress mark" : sym}
      className={`ipa inline-grid touch-manipulation place-items-center rounded-2xl border-2 border-b-4 text-ink transition-transform active:translate-y-0.5 active:border-b-2 disabled:opacity-100 ${tone} ${
        small ? "h-12 min-w-0 text-2xl" : "h-14 min-w-12 px-2.5 text-3xl max-sm:h-12 max-sm:min-w-11 max-sm:text-[1.6rem]"
      } ${ghost ? "invisible" : ""}`}
    >
      {sym}
    </button>
  );
}

/** IPA practice: hear a word, then build its transcription from tiles (or write it, then tap the symbols you wrote). */
export function IpaPractice() {
  const all = useMemo(() => practiceWords(), []);
  const [stage, setStage] = useState<"intro" | "round" | "done">("intro");
  const [mode, setMode] = useState<Mode>("build");
  const [round, setRound] = useState<{ words: PracticeWord[]; banks: string[][] } | null>(null);
  const [index, setIndex] = useState(0);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [result, setResult] = useState<IpaResult | null>(null);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [lostCombo, setLostCombo] = useState(0);
  const [tally, setTally] = useState<Tally>({ perfect: 0, good: 0, miss: 0 });
  const [coach, setCoach] = useState<BotMood>("idle");
  const [look, setLook] = useState<{ x: number; y: number } | null>(null);
  const coachTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(coachTimer.current), []);
  // Write mode: Myna (Claude, on the server) can read the handwriting; the student confirms or fixes it, the app grades it
  const readOn = useAiEnabled("/api/read-ipa");
  // tapping a tile says its sound (the recording if there is one, otherwise the key word: "think" for θ)
  const [tileSounds, setTileSounds] = useState(true);
  const { play: playSound, last: lastSound } = useIpaSound((on) => setCoach(on ? "listening" : "idle"));
  // /ipa?samples=1: a "Save sample" button, to collect real handwriting for tools/compare-readers.ts
  const sampleMode = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("samples") === "1",
    () => false,
  );
  // /ipa?focus=θ,z (from My Progress, "Practise these"): rounds favour words with those sounds
  const focusRaw = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("focus") ?? "",
    () => "",
  );
  const focus = useMemo(() => parseFocus(focusRaw), [focusRaw]);
  const pad = useRef<WritePadHandle>(null);
  const [hasInk, setHasInk] = useState(false);
  const [reading, setReading] = useState<"idle" | "busy" | "done">("idle");
  const [readNote, setReadNote] = useState<{ en: string; th: string; error?: boolean } | null>(null);

  const readWriting = async () => {
    const png = pad.current?.toPng();
    if (!png || reading === "busy") return;
    setReading("busy");
    setReadNote({ en: "Myna is reading your writing…", th: "Myna กำลังอ่านลายมือของคุณ…" });
    clearTimeout(coachTimer.current);
    setCoach("thinking");
    try {
      const res = await fetch("/api/read-ipa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: png }) });
      if (!res.ok) {
        const err: AiError = aiErrorFor(res.status);
        setReadNote({ ...AI_ERROR[err], error: true });
        flash("sad", 1400);
        return;
      }
      const r = (await res.json()) as { ipa: string; unsure: string[] };
      const syms = parseIpa(r.ipa).filter((s) => !s.startsWith("?"));
      setPlaced(syms.map((sym) => ({ sym, bank: null })));
      const unsure = r.unsure.length ? ` (not sure about: ${r.unsure.map((u) => parseIpa(u).join("")).join(" ")})` : "";
      setReadNote(
        syms.length
          ? { en: `Is this what you wrote?${unsure} Fix any symbol below, then press CHECK.`, th: "ใช่สิ่งที่คุณเขียนไหม? แก้สัญลักษณ์ได้ด้านล่าง แล้วกด CHECK" }
          : { en: "Myna couldn't read it. Write bigger, or tap the symbols below.", th: "Myna อ่านไม่ออก ลองเขียนให้ใหญ่ขึ้น หรือแตะสัญลักษณ์ด้านล่าง", error: true },
      );
      flash(syms.length ? "wink" : "sad", 1200);
    } catch {
      setReadNote({ ...AI_ERROR.offline, error: true });
      flash("sad", 1400);
    } finally {
      setReading("done");
    }
  };

  const start = useCallback(() => {
    const rand = seededRandom(Date.now() % 2147483647);
    const words = pickRoundWords(all, ROUND, rand, focus);
    setRound({ words, banks: words.map((w) => tileBank(w, rand)) });
    setIndex(0);
    setPlaced([]);
    setResult(null);
    setCombo(0);
    setBestCombo(0);
    setLostCombo(0);
    setTally({ perfect: 0, good: 0, miss: 0 });
    setCoach("idle");
    setReading("idle");
    setReadNote(null);
    setHasInk(false);
    setStage("round");
  }, [all, focus]);

  const flash = (m: BotMood, ms = 700) => {
    clearTimeout(coachTimer.current);
    setCoach(m);
    coachTimer.current = setTimeout(() => setCoach("idle"), ms);
  };

  if (stage === "intro") {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-6 px-4 py-10 text-center">
        <MynaBot mood="wink" className="h-32 w-32" />
        <h1 className="text-3xl font-black tracking-tight">
          IPA practice
          <span className="thai block text-xl font-bold text-muted">ฝึกถอดเสียง IPA</span>
        </h1>
        <p className="font-semibold text-muted">
          Hear a word, then write how it sounds in American English IPA. {ROUND} words per round.
          <span className="thai block">ฟังคำศัพท์ แล้วเขียนเสียงเป็น IPA แบบอเมริกัน รอบละ {ROUND} คำ</span>
        </p>
        {focus.length > 0 && (
          <p className="font-bold">
            Focus: <span className="ipa text-lg">{focus.join(" ")}</span>
            <span className="thai block font-semibold text-muted">ฝึกเสียงที่ยังพลาดบ่อย</span>
          </p>
        )}
        <div className="grid w-full gap-3 sm:grid-cols-2" role="radiogroup" aria-label="How to answer · วิธีตอบ">
          {(
            [
              { id: "build", icon: "▦", en: "Build it", th: "เรียงสัญลักษณ์", sub: { en: "Tap symbol tiles. Phone or iPad.", th: "แตะเลือกสัญลักษณ์ ใช้ได้ทั้งมือถือและ iPad" } },
              {
                id: "write",
                icon: "✎",
                en: "Write it",
                th: "เขียนด้วยมือ",
                sub: readOn
                  ? { en: "Write with your Pencil; Myna reads it, you check it. iPad recommended.", th: "เขียนด้วยปากกา Myna อ่านให้ แล้วคุณตรวจอีกครั้ง แนะนำ iPad" }
                  : { en: "Write with your Pencil, then tap what you wrote. iPad recommended.", th: "เขียนด้วยปากกา แล้วแตะสัญลักษณ์ที่เขียน แนะนำ iPad" },
              },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => setMode(m.id)}
              className={`card flex flex-col items-start gap-1 p-4 text-left ${mode === m.id ? "border-accent bg-accent-soft" : ""}`}
            >
              <span className="text-lg font-black">
                <span aria-hidden>{m.icon} </span>
                {m.en} <span className="thai text-base font-bold text-muted">{m.th}</span>
              </span>
              <span className="text-sm font-semibold text-muted">
                {m.sub.en}
                <span className="thai block">{m.sub.th}</span>
              </span>
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-primary w-full py-4 text-lg" onClick={start}>
          START <span className="thai text-base font-semibold">เริ่ม</span>
        </button>
        <Link href="/" className="text-sm font-bold text-muted underline">
          Back to the path · กลับไปหน้าหลัก
        </Link>
      </main>
    );
  }

  if (stage === "done" || !round) {
    const correct = tally.perfect + tally.good;
    const allPerfect = tally.perfect === ROUND;
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-4 py-10 text-center">
        <MynaBot mood={allPerfect ? "perfect" : correct >= ROUND / 2 ? "happy" : "wink"} className="h-32 w-32" />
        <h1 className="text-3xl font-black">
          Round complete!<span className="thai block text-xl font-bold text-muted">จบรอบแล้ว!</span>
        </h1>
        <p className="text-5xl font-black tabular-nums text-good">
          {correct} / {ROUND}
        </p>
        {allPerfect && <p className="font-black text-good">All Perfect! · สมบูรณ์แบบทุกข้อ!</p>}
        <dl className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["Perfect", "สมบูรณ์แบบ", tally.perfect, "text-good"],
              ["Good", "ถูก", tally.good, "text-good"],
              ["Missed", "พลาด", tally.miss, "text-bad"],
              ["Best combo", "ต่อเนื่องสูงสุด", bestCombo, "text-accent"],
            ] as const
          ).map(([en, th, n, cls]) => (
            <div key={en} className="card p-3">
              <dt className="text-xs font-extrabold text-muted">
                {en}
                <span className="thai block font-medium">{th}</span>
              </dt>
              <dd className={`text-3xl font-black tabular-nums ${cls}`}>{n}</dd>
            </div>
          ))}
        </dl>
        <div className="flex w-full flex-col gap-3">
          <button type="button" className="btn btn-primary w-full py-4 text-lg" onClick={start}>
            PRACTISE AGAIN <span className="thai text-base font-semibold">ฝึกอีกรอบ</span>
          </button>
          <Link href="/" className="btn w-full py-4 text-lg">
            Back to the path <span className="thai text-base font-semibold">กลับไปหน้าหลัก</span>
          </Link>
        </div>
      </main>
    );
  }

  const word = round.words[index];
  const bank = round.banks[index];
  const used = new Set(placed.map((p) => p.bank).filter((b): b is number => b !== null));
  const locked = result !== null;

  const check = () => {
    if (locked || !placed.length) return;
    const got = placed.map((p) => p.sym);
    const r = gradeIpa(word.tokens, got);
    recordIpaAttempt({ word: word.word, mode, grade: r.grade, answer: word.tokens, got }); // My Progress + Supabase; never throws
    const ok = r.grade !== "miss";
    const nextCombo = ok ? combo + 1 : 0;
    setLostCombo(ok ? 0 : combo);
    setCombo(nextCombo);
    setBestCombo((b) => Math.max(b, nextCombo));
    setTally((t) => ({ ...t, [r.grade]: t[r.grade] + 1 }));
    playResult(ok, { combo: nextCombo, perfect: r.grade === "perfect" });
    clearTimeout(coachTimer.current);
    setCoach("watch");
    setLook({ x: 0, y: 8 });
    setResult(r);
  };
  const next = () => {
    if (index + 1 >= ROUND) {
      setStage("done");
      return;
    }
    setIndex(index + 1);
    setPlaced([]);
    setResult(null);
    setReading("idle");
    setReadNote(null);
    setHasInk(false);
    setCoach("idle");
    setLook(null);
  };
  const skip = () => {
    setTally((t) => ({ ...t, miss: t.miss + 1 }));
    setLostCombo(combo);
    setCombo(0);
    next();
  };

  const sheetMood: BotMood = !result ? "idle" : result.grade === "miss" ? "sad" : result.grade === "perfect" ? "perfect" : combo === 3 || combo === 5 ? "surprised" : "happy";
  const pct = Math.round(((index + (locked ? 1 : 0)) / ROUND) * 100);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <Immersive />
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-bg px-4 py-3">
        <Link href="/" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl font-black text-muted hover:bg-line" aria-label="Leave practice">
          ✕
        </Link>
        <div className="h-4 flex-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={ROUND} aria-valuenow={index + (locked ? 1 : 0)} aria-label="Progress">
          <div className="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
        </div>
        <span key={combo} className={`combo-pop inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-black tabular-nums ${combo >= 2 ? "bg-good text-white" : "bg-line text-muted"}`} aria-label={`Combo ${combo}`}>
          <span aria-hidden>⚡</span>×{combo}
        </span>
      </header>

      <main className="flex flex-1 flex-col gap-4 px-4 pb-72 pt-2">
        <div className="flex items-start gap-3">
          <MynaBot mood={coach} look={look} className="h-14 w-14" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black leading-snug sm:text-2xl">
              {mode === "build" ? "Build the IPA for this word" : "Write the IPA for this word"}
              <span className="thai block text-base font-bold text-muted">
                {mode === "build" ? "เรียงสัญลักษณ์ IPA ของคำนี้" : "เขียน IPA ของคำนี้ แล้วแตะสัญลักษณ์ที่เขียน"}
              </span>
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <span className="text-5xl font-black sm:text-6xl">{word.word}</span>
          <button
            type="button"
            className="btn btn-accent h-14 w-14 p-0 text-xl"
            aria-label={`Hear "${word.word}"`}
            onClick={() => speakWord(word.word, 0.9, (on) => (on ? setCoach("listening") : setCoach(locked ? "watch" : "idle")))}
          >
            🔊
          </button>
          <button
            type="button"
            className="btn h-12 w-12 p-0 text-sm"
            aria-label={`Hear "${word.word}" slowly`}
            onClick={() => speakWord(word.word, 0.5, (on) => (on ? setCoach("listening") : setCoach(locked ? "watch" : "idle")))}
          >
            🐢
          </button>
          <button
            type="button"
            className={`btn h-12 px-3 text-sm ${tileSounds ? "border-accent text-accent" : "text-muted"}`}
            aria-pressed={tileSounds}
            title="Tap a symbol to hear its sound"
            onClick={() => setTileSounds((v) => !v)}
          >
            {tileSounds ? "🔈" : "🔇"} <span className="max-sm:sr-only">Tile sounds</span> <span className="thai text-xs font-semibold max-sm:sr-only">เสียงสัญลักษณ์</span>
          </button>
          <span className="thai w-full text-center text-muted">{word.th}</span>
        </div>

        <div className="flex min-h-20 flex-wrap items-center justify-center gap-1.5 border-b-2 border-line py-2" aria-label="Your transcription · คำตอบของคุณ">
          <span className="ipa px-0.5 text-4xl text-muted">/</span>
          {placed.length === 0 && <span className="text-sm font-bold text-muted">{mode === "build" ? "Tap symbols below · แตะสัญลักษณ์ด้านล่าง" : "…"}</span>}
          {placed.map((p, k) => (
            <Tile
              key={k}
              sym={p.sym}
              state={result ? (result.badGot.has(k) ? "bad" : "good") : undefined}
              disabled={locked}
              onClick={() => setPlaced((list) => list.filter((_, j) => j !== k))}
            />
          ))}
          <span className="ipa px-0.5 text-4xl text-muted">/</span>
        </div>
        {tileSounds && lastSound && !locked && (
          <p className="-mt-2 text-center text-sm font-bold text-muted" aria-live="polite">
            <span className="ipa text-lg text-ink">{lastSound.symbol}</span>{" "}
            {lastSound.source === "clip" ? "· " : ""}as in{" "}
            <span className="text-ink">
              {keyWordParts(lastSound.sound)[0]}
              <b className="text-accent underline decoration-2 underline-offset-4">{keyWordParts(lastSound.sound)[1]}</b>
              {keyWordParts(lastSound.sound)[2]}
            </span>
            <span className="thai block font-medium">
              เสียง {lastSound.symbol} ในคำว่า {lastSound.sound.word}
            </span>
          </p>
        )}

        {mode === "build" ? (
          <div className="flex flex-wrap justify-center gap-2.5 pt-1" aria-label="Symbols · สัญลักษณ์">
            {bank.map((sym, k) => (
              <Tile
                key={k}
                sym={sym}
                ghost={used.has(k)}
                disabled={locked || used.has(k)}
                onClick={() => {
                  if (tileSounds) playSound(sym);
                  setPlaced((list) => [...list, { sym, bank: k }]);
                  setLook({ x: 0, y: 7 });
                  flash("watch");
                }}
              />
            ))}
          </div>
        ) : (
          <>
            <WritePad
              key={word.word}
              padRef={pad}
              disabled={locked}
              onInk={setHasInk}
              onPen={(fx) => {
                if (fx === null) return flash("wink", 600);
                clearTimeout(coachTimer.current);
                setCoach("watch");
                setLook({ x: (fx - 0.5) * 12, y: 6 });
              }}
            />
            {sampleMode && (
              <div className="flex justify-center">
                <button
                  type="button"
                  className="btn border-dashed px-4 py-2 text-sm"
                  disabled={!hasInk}
                  onClick={() => {
                    const png = pad.current?.toPng();
                    if (!png) return;
                    const a = document.createElement("a");
                    a.href = `data:image/png;base64,${png}`;
                    a.download = `${word.word}--${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
                    a.click();
                  }}
                >
                  ⬇ Save sample <span className="thai font-semibold">บันทึกตัวอย่างลายมือ</span>
                </button>
              </div>
            )}
            {readOn && !locked && (
              <div className="flex flex-col items-center gap-2">
                <button type="button" className="btn btn-accent px-5 py-3" disabled={!hasInk || reading === "busy"} onClick={readWriting}>
                  {reading === "busy" ? "Reading…" : "✨ Read my writing"} <span className="thai text-sm font-semibold">อ่านลายมือ</span>
                </button>
                {readNote && (
                  <p className={`text-center text-sm font-bold ${readNote.error ? "text-bad" : "text-muted"}`} aria-live="polite">
                    {readNote.en}
                    <span className="thai block font-medium">{readNote.th}</span>
                  </p>
                )}
              </div>
            )}
            {!locked && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-extrabold uppercase tracking-wider text-muted">
                  {readOn ? "Or tap the symbols you wrote · หรือแตะสัญลักษณ์ที่คุณเขียน" : "Tap the symbols you wrote · แตะสัญลักษณ์ที่คุณเขียน"}
                </p>
                {[VOWELS, CONSONANTS, [STRESS]].map((row, r) => (
                  <div key={r} className="grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-1.5">
                    {row.map((sym) => (
                      <Tile
                        key={sym}
                        small
                        sym={sym}
                        onClick={() => {
                          if (tileSounds) playSound(sym);
                          setPlaced((list) => [...list, { sym, bank: null }]);
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <footer className={`fixed inset-x-0 bottom-0 z-20 border-t-2 ${result ? (result.grade !== "miss" ? "border-good bg-good-soft" : "border-warn bg-warn-soft") : "border-line bg-bg"}`}>
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
          {result && (
            <div role="status" aria-live="polite" className={`flex items-start gap-3 ${result.grade !== "miss" ? "text-good" : "text-warn"}`}>
              <MynaBot mood={sheetMood} className="-mt-1 h-14 w-14" />
              <div className="min-w-0">
                <p className="text-2xl font-black">
                  {TITLE[result.grade].en} <span className="thai text-lg font-bold">{TITLE[result.grade].th}</span>
                </p>
                <p className="ipa flex flex-wrap items-center gap-0.5 text-2xl font-bold text-ink" aria-label={`Correct answer ${word.display}. Tap a symbol to hear it.`}>
                  /
                  {word.tokens.map((t, k) => (
                    <button key={k} type="button" className="rounded-md px-0.5 hover:bg-black/10 focus-visible:outline-2" onClick={() => playSound(t)} disabled={t === "ˈ"}>
                      {t}
                    </button>
                  ))}
                  /
                </p>
                {result.message ? (
                  <>
                    <p className="mt-1 font-semibold text-ink">{result.message.en}</p>
                    <p className="thai text-sm text-ink/80">{result.message.th}</p>
                  </>
                ) : (
                  <p className="mt-1 font-semibold text-ink">
                    That&apos;s exactly “{word.word}”. <span className="thai text-sm">ถูกต้องทุกสัญลักษณ์</span>
                  </p>
                )}
                {result.grade !== "miss" && combo >= 2 && (
                  <p className="mt-1 text-sm font-black">
                    Combo ×{combo} <span className="thai font-semibold text-muted">ถูกต่อเนื่อง {combo} ข้อ</span>
                  </p>
                )}
                {result.grade === "miss" && lostCombo >= 2 && (
                  <p className="mt-1 text-sm font-black text-bad">
                    Combo ×{lostCombo} lost <span className="thai font-semibold text-muted">เสียคอมโบ</span>
                  </p>
                )}
              </div>
            </div>
          )}
          {!result ? (
            <div className="flex gap-3">
              <button type="button" className="btn py-4 text-lg" onClick={skip}>
                Skip <span className="thai text-base font-semibold">ข้าม</span>
              </button>
              <button type="button" className="btn btn-primary flex-1 py-4 text-lg" onClick={check} disabled={!placed.length}>
                CHECK <span className="thai text-base font-semibold">ตรวจคำตอบ</span>
              </button>
            </div>
          ) : (
            <button type="button" className={`btn w-full py-4 text-lg ${result.grade !== "miss" ? "btn-accent" : "btn-primary"}`} onClick={next} autoFocus>
              {index + 1 === ROUND ? "FINISH" : "CONTINUE"} <span className="thai text-base font-semibold">{index + 1 === ROUND ? "เสร็จสิ้น" : "ต่อไป"}</span>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

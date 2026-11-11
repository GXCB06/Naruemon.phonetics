"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bi, LangToggle, useLang } from "@/components/home/lang";
import { MynaBot, type BotMood } from "@/components/mascot/MynaBot";
import type { Bilingual } from "@/lib/course/units";
import { markOnboarded } from "./seen";

/** A sentence with a 2-3-1 tune: "Good MORN-ing." */
const WORDS = [
  { text: "Good", x: 100, level: 2 },
  { text: "MORN", x: 190, level: 3 },
  { text: "ing.", x: 262, level: 1 },
];
const LEVEL_Y: Record<number, number> = { 4: 22, 3: 56, 2: 90, 1: 124 };

const LEVELS: { n: number; name: Bilingual }[] = [
  { n: 4, name: { en: "extra high", th: "สูงมาก" } },
  { n: 3, name: { en: "high", th: "สูง" } },
  { n: 2, name: { en: "normal", th: "ปกติ" } },
  { n: 1, name: { en: "low", th: "ต่ำ" } },
];

interface Step {
  mood: BotMood;
  title: Bilingual;
  body: Bilingual;
  art?: "levels" | "draw" | "features";
}

/** The places in the app, for the last tour screen ("what you can do in Melobi"). */
const FEATURES: { emoji: string; name: Bilingual; text: Bilingual }[] = [
  { emoji: "🏠", name: { en: "Learn", th: "เรียน" }, text: { en: "Lessons on the map, one tune at a time", th: "บทเรียนบนแผนที่ ทีละทำนอง" } },
  { emoji: "🎯", name: { en: "Practice", th: "ฝึกฝน" }, text: { en: "Pick a pattern to draw: 2-3-1, 2-3, 2-3-2, lists, tags, or a quick quiz", th: "เลือกรูปแบบมาวาด: 2-3-1, 2-3, 2-3-2, รายการ, tag หรือควิซเร็ว" } },
  { emoji: "🎙️", name: { en: "Speak", th: "ฝึกพูด" }, text: { en: "Say a sentence and see your tune next to the target", th: "พูดประโยคแล้วดูทำนองของคุณเทียบกับแบบ" } },
  { emoji: "ə", name: { en: "IPA", th: "IPA" }, text: { en: "Hear a word and build or write its sounds", th: "ฟังคำแล้วเรียงหรือเขียนเสียง" } },
  { emoji: "📊", name: { en: "Progress", th: "สถิติ" }, text: { en: "Charts of how you're doing, and what to improve", th: "กราฟความก้าวหน้า และสิ่งที่ควรพัฒนา" } },
];

const STEPS: Step[] = [
  {
    mood: "wink",
    title: { en: "Hi, I'm Melobi!", th: "สวัสดี ฉันชื่อ Melobi!" },
    body: {
      en: "I help you practise English intonation: the tune your voice makes when you say a sentence.",
      th: "ฉันจะช่วยคุณฝึกทำนองเสียงภาษาอังกฤษ คือการขึ้นลงของเสียงเวลาพูดประโยค",
    },
  },
  {
    mood: "thinking",
    title: { en: "Four pitch levels", th: "ระดับเสียง 4 ระดับ" },
    body: {
      en: "Your voice moves between levels 1 to 4. Most sentences start at 2, go up to 3 on the important word, then fall to 1.",
      th: "เสียงของเราขึ้นลงระหว่างระดับ 1 ถึง 4 ประโยคส่วนใหญ่เริ่มที่ระดับ 2 ขึ้นไประดับ 3 ที่คำสำคัญ แล้วลงไประดับ 1",
    },
    art: "levels",
  },
  {
    mood: "watch",
    title: { en: "Draw the tune", th: "วาดทำนองเสียง" },
    body: {
      en: "Draw the tune right on the sentence with your Apple Pencil or your finger. Melobi checks it against the rules from class.",
      th: "วาดทำนองเสียงลงบนประโยคได้เลย ด้วย Apple Pencil หรือนิ้วของคุณ แล้ว Melobi จะตรวจตามกฎที่เรียนในห้อง",
    },
    art: "draw",
  },
  {
    mood: "listening",
    title: { en: "Listen, then say it", th: "ฟัง แล้วพูดตาม" },
    body: {
      en: "Tap 🔊 to hear the sentence, then tap 🎙️ and say it. You'll see your tune next to the target. Melobi checks your microphone first, and your voice is never saved.",
      th: "แตะ 🔊 เพื่อฟังประโยค แล้วแตะ 🎙️ และพูดตาม คุณจะเห็นทำนองเสียงของคุณเทียบกับแบบ Melobi จะเช็กไมค์ให้ก่อน และเสียงของคุณจะไม่ถูกเก็บไว้",
    },
  },
  {
    mood: "happy",
    title: { en: "Everything in Melobi", th: "ทุกอย่างใน Melobi" },
    body: {
      en: "Find all of it in the bar at the bottom of the screen. IPA lives in Practice.",
      th: "หาได้จากแถบด้านล่างของจอ ส่วน IPA อยู่ในหน้าฝึกฝน",
    },
    art: "features",
  },
];

const T = {
  skip: { en: "Skip", th: "ข้าม" },
  next: { en: "Next", th: "ถัดไป" },
  back: { en: "Back", th: "ย้อนกลับ" },
  start: { en: "Let's go", th: "ไปกันเลย" },
  step: { en: "Step", th: "ขั้นที่" },
} satisfies Record<string, Bilingual>;

/**
 * "How Melobi works": 4 short bilingual screens with the bot. Shown once on the first open (from the home page) and again
 * from "How Melobi works" (/welcome). Skippable; finishing or skipping is remembered in localStorage.
 *
 * `inline`: rendered by the home page in place of the path, so finishing simply reveals the path (no navigation).
 */
export function Onboarding({ inline = false }: { inline?: boolean }) {
  const router = useRouter();
  const lang = useLang();
  const [i, setI] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  // Move focus to the new screen's title so screen readers announce it (not on the very first render).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [i]);

  /**
   * Finishing the tour on a first visit (inline) leads to the sign-in page, where "Skip for now" goes on to the map.
   * Skipping the tour, or looking at it again later from More, never asks for a sign-in.
   */
  const finish = (dest: "home" | "sign-in") => {
    markOnboarded();
    if (dest === "sign-in" && inline) router.push("/login?next=%2F&welcome=1");
    else if (!inline) router.push("/");
    else window.scrollTo(0, 0);
  };
  const next = () => (last ? finish("sign-in") : setI((n) => Math.min(STEPS.length - 1, n + 1)));
  const back = () => setI((n) => Math.max(0, n - 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowRight") setI((n) => Math.min(STEPS.length - 1, n + 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-1 flex-col px-4">
      <header className="flex items-center gap-2 py-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <MynaBot className="size-9 shrink-0" />
          <span className="text-xl font-black tracking-tight">Melobi</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <LangToggle />
          {!last && (
            <button
              type="button"
              onClick={() => finish("home")}
              className="min-h-11 rounded-xl px-3 font-extrabold text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              <Bi text={T.skip} className="items-center" />
            </button>
          )}
        </div>
      </header>

      <main
        className="flex flex-1 touch-pan-y flex-col items-center justify-center gap-6 py-4 md:landscape:flex-row md:landscape:gap-12"
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse") swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        }}
        onPointerUp={(e) => {
          const s = swipe.current;
          swipe.current = null;
          if (!s || s.id !== e.pointerId) return;
          const dx = e.clientX - s.x;
          if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(e.clientY - s.y)) (dx < 0 ? next : back)();
        }}
        onPointerCancel={() => (swipe.current = null)}
      >
        <div className="flex w-full max-w-md shrink-0 flex-col items-center gap-4 md:landscape:w-1/2">
          <MynaBot mood={step.mood} className={step.art ? "size-28 sm:size-36" : "size-36 sm:size-48"} key={i} />
          {step.art === "features" && (
            <Card>
              <ul className="flex flex-col gap-2.5">
                {FEATURES.map((f) => (
                  <li key={f.name.en} className="flex items-center gap-3">
                    <span aria-hidden className="ipa flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-xl font-black text-accent">
                      {f.emoji}
                    </span>
                    <span className="min-w-0 text-sm font-semibold">
                      <span className="block text-base font-black">
                        <Bi text={f.name} inline className="flex-row! items-baseline gap-1.5" />
                      </span>
                      <Bi text={f.text} subClassName="hidden" />
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {step.art && step.art !== "features" && (
            <Card>
              <TuneArt mode={step.art} key={`${step.art}-${i}`} />
              {step.art === "levels" && (
                <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm font-bold">
                  {LEVELS.map((l) => (
                    <li key={l.n} className="flex items-baseline gap-2">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent-soft font-black text-accent">
                        {l.n}
                      </span>
                      <Bi text={l.name} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        <section aria-live="polite" className="flex w-full max-w-md flex-col gap-4 md:landscape:w-1/2">
          <p className="text-xs font-black uppercase tracking-wide text-muted">
            {T.step[lang]} {i + 1} / {STEPS.length}
          </p>
          <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-black leading-tight tracking-tight outline-none sm:text-4xl">
            <Bi text={step.title} subClassName="text-[0.6em]" />
          </h1>
          <p className="text-lg font-semibold">
            <Bi text={step.body} subClassName="mt-1 text-[0.85em]" />
          </p>

        </section>
      </main>

      <footer className="sticky bottom-0 bg-bg pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex w-full max-w-md items-center gap-3 md:landscape:max-w-5xl">
          <button
            type="button"
            onClick={back}
            className={`btn min-h-14 min-w-14 shrink-0 ${i === 0 ? "invisible" : ""}`}
            aria-hidden={i === 0}
            aria-label={T.back[lang]}
          >
            <span aria-hidden>←</span>
            <Bi text={T.back} className="hidden items-start whitespace-nowrap text-left sm:flex" />
          </button>
          <ol className="flex min-w-0 flex-1 items-center justify-center gap-1" aria-label={`${T.step[lang]} ${i + 1} / ${STEPS.length}`}>
            {STEPS.map((_, n) => (
              <li key={n}>
                <button
                  type="button"
                  onClick={() => setI(n)}
                  aria-label={`${T.step[lang]} ${n + 1}`}
                  aria-current={n === i ? "step" : undefined}
                  className="flex size-6 items-center justify-center"
                >
                  <span className={`block h-2.5 rounded-full transition-all ${n === i ? "w-6 bg-accent" : "w-2.5 bg-line"}`} />
                </button>
              </li>
            ))}
          </ol>
          <button type="button" onClick={next} className="btn btn-primary min-h-14 shrink-0 px-5 text-lg">
            <Bi text={last ? T.start : T.next} className="items-start whitespace-nowrap text-left" subClassName="!text-primary-ink/80" />
            {!last && <span aria-hidden>→</span>}
          </button>
        </div>
      </footer>
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div className="card w-full p-3">{children}</div>;
}

/** The 4 level lines with "Good MORN-ing." on them: a stepped 2-3-1 tune, or a hand-drawn pen line being drawn. */
function TuneArt({ mode }: { mode: "levels" | "draw" }) {
  const steps = WORDS.map((w, k) => {
    const x0 = k === 0 ? 62 : (WORDS[k - 1].x + w.x) / 2 + 6;
    const x1 = k === WORDS.length - 1 ? 300 : (w.x + WORDS[k + 1].x) / 2 - 6;
    return { x0, x1, y: LEVEL_Y[w.level] };
  });
  const stepPath = steps.map((s, k) => `${k ? "L" : "M"}${s.x0} ${s.y}H${s.x1}`).join("");
  const pen = "M64 92C88 89 112 93 132 84C152 72 160 58 182 55C204 52 214 58 228 76C242 98 258 120 298 125";
  return (
    <svg viewBox="0 0 320 170" className="block h-auto w-full" role="img" aria-label="Good MORN-ing: 2, 3, 1">
      {[4, 3, 2, 1].map((n) => (
        <g key={n}>
          <line x1="44" x2="308" y1={LEVEL_Y[n]} y2={LEVEL_Y[n]} stroke="var(--target)" strokeOpacity=".55" strokeWidth="1.5" strokeDasharray="5 7" />
          <text x="22" y={LEVEL_Y[n] + 5} textAnchor="middle" fill="var(--muted)" fontSize="14" fontWeight="900">
            {n}
          </text>
        </g>
      ))}
      {mode === "levels" ? (
        <>
          <path d={stepPath} fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          {steps.map((s, k) => (
            <circle key={k} cx={(s.x0 + s.x1) / 2} cy={s.y} r="7" fill="var(--card)" stroke="var(--accent)" strokeWidth="3" />
          ))}
        </>
      ) : (
        <path d={pen} pathLength={1} className="onb-pen" fill="none" stroke="var(--pen)" strokeWidth="5" strokeLinecap="round" />
      )}
      {WORDS.map((w) => (
        <text
          key={w.text}
          x={w.x}
          y="160"
          textAnchor="middle"
          fill="var(--ink)"
          fontSize="20"
          fontWeight={w.level === 3 ? 900 : 700}
          style={{ fontFamily: "var(--nf-ui), sans-serif" }}
        >
          {w.text}
        </text>
      ))}
    </svg>
  );
}

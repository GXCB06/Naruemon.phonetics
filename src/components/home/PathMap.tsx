"use client";

import type { CSSProperties, Ref } from "react";
import { MynaBot, type BotMood } from "@/components/mascot/MynaBot";
import { CIRCLE_CENTRE_Y, PATH_WIDTH, ROW_HEIGHT, columnHeight, nodeCentre, nodeOffset } from "@/lib/course/path.ts";
import type { PathNode, PathStop, PathUnit } from "@/lib/course/path.ts";
import { LockIcon, StarIcon } from "./icons";
import { Bi, useLang } from "./lang";
import { COPY, nodeAriaLabel } from "./copy";

/** Unit colour tokens, by position on the path (globals.css --u1 … --u5). */
export function unitColor(n: number): CSSProperties {
  const k = ((n - 1) % 5) + 1;
  return { "--u": `var(--u${k})`, "--u-deep": `var(--u${k}-deep)` } as CSSProperties;
}

const MOODS: BotMood[] = ["wink", "happy", "watch", "surprised", "listening"];

function BigStar() {
  return (
    <svg viewBox="0 0 24 24" className="size-9" aria-hidden fill="currentColor">
      <path d="M12 2.6l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}
function ChestIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 48 44" className="h-15 w-16 drop-shadow-[0_4px_0_rgb(0_0_0/0.15)]" aria-hidden>
      {open ? (
        <path d="M6 14 L24 4 L42 14 L42 18 L6 18 Z" fill="#c98a2b" stroke="#7a4d12" strokeWidth="2.5" strokeLinejoin="round" transform="rotate(-14 6 18)" />
      ) : (
        <path d="M6 18 Q6 8 16 8 H32 Q42 8 42 18 Z" fill="#e0a43c" stroke="#7a4d12" strokeWidth="2.5" strokeLinejoin="round" />
      )}
      <rect x="6" y="18" width="36" height="22" rx="3" fill="#c98a2b" stroke="#7a4d12" strokeWidth="2.5" />
      <rect x="6" y="18" width="36" height="5" fill="#f2c56b" stroke="#7a4d12" strokeWidth="2.5" />
      {!open && <rect x="20" y="20" width="8" height="9" rx="2" fill="#ffe08a" stroke="#7a4d12" strokeWidth="2" />}
      {open && <path d="M14 14l2-5M24 12V6M34 14l-2-5" stroke="#ffd34d" strokeWidth="2.5" strokeLinecap="round" />}
    </svg>
  );
}
function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-9" aria-hidden fill="currentColor">
      <path d="M7 3h10v4a5 5 0 0 1-10 0z" />
      <path d="M7 5H4v1.5A3.5 3.5 0 0 0 7.5 10M17 5h3v1.5A3.5 3.5 0 0 1 16.5 10" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M10.5 12h3v4h-3z" />
      <path d="M8 21v-2.5c0-1 .8-1.5 1.8-1.5h4.4c1 0 1.8.5 1.8 1.5V21z" />
    </svg>
  );
}

function StopIcon({ stop }: { stop: PathStop }) {
  if (stop.kind === "chest") return <ChestIcon open={stop.state === "done"} />;
  if (stop.kind === "trophy") return <TrophyIcon />;
  if (stop.kind === "ipa") return <span className="ipa text-2xl font-black leading-none">/ə/</span>;
  if (stop.state === "locked") return <LockIcon className="size-7" />;
  return <BigStar />;
}

function stopLabel(stop: PathStop, unit: PathUnit, lang: "en" | "th"): string {
  if (stop.node) return nodeAriaLabel(stop.node, lang);
  const t = lang === "th";
  if (stop.kind === "chest")
    return stop.state === "available" ? (t ? "หีบรางวัล: แตะเพื่อเปิด" : "Reward chest: tap to open") : stop.state === "done" ? (t ? "หีบรางวัล: เปิดแล้ว" : "Reward chest: opened") : t ? "หีบรางวัล: ทำบทเรียนก่อนหน้าให้จบก่อน" : "Reward chest: finish the lessons before it";
  if (stop.kind === "ipa") return stop.state === "locked" ? (t ? "ฝึก IPA: ทำบทแรกให้จบก่อน" : "IPA practice: finish the first lesson") : t ? "ฝึก IPA" : "IPA practice";
  return stop.state === "done" ? (t ? `ถ้วยรางวัลยูนิต ${unit.number}: สำเร็จ` : `Unit ${unit.number} trophy: complete`) : t ? `ถ้วยรางวัลยูนิต ${unit.number}` : `Unit ${unit.number} trophy`;
}

function Stop({
  stop,
  unit,
  index,
  onOpen,
  onStop,
  currentRef,
}: {
  stop: PathStop;
  unit: PathUnit;
  index: number;
  onOpen: (n: PathNode) => void;
  onStop: (s: PathStop, unit: PathUnit) => void;
  currentRef?: Ref<HTMLLIElement>;
}) {
  const lang = useLang();
  const c = nodeCentre(index);
  const current = stop.state === "current";
  // colour = done or ready; grey = not reached yet (still tappable for lessons, like any open lesson)
  const coloured = stop.state === "done" || current || (stop.kind === "chest" && stop.state === "available") || (stop.kind === "ipa" && stop.state === "available");
  const tappable = stop.kind === "lesson" ? stop.state !== "locked" : stop.kind === "trophy" ? false : stop.state !== "locked";
  const style: CSSProperties = { left: `${(c.x / PATH_WIDTH) * 100}%`, top: c.y - 33 };
  const chestLike = stop.kind === "chest";

  return (
    <li ref={current ? currentRef : undefined} className="absolute -translate-x-1/2" style={style}>
      {current && (
        <span className="start-bubble text-sm">
          {COPY.startHere[lang]}
        </span>
      )}
      <div className="relative">
        {current && <span className="stop-ring" aria-hidden />}
        <button
          type="button"
          aria-label={stopLabel(stop, unit, lang)}
          aria-disabled={!tappable || undefined}
          onClick={!tappable ? undefined : () => (stop.node ? onOpen(stop.node) : onStop(stop, unit))}
          className={`stop ${coloured ? "" : "is-grey"} ${chestLike ? "bg-transparent! shadow-none! after:hidden" : ""} ${tappable ? "cursor-pointer" : "cursor-default"} focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-accent`}
          style={chestLike && stop.state === "locked" ? { filter: "grayscale(0.85)", opacity: 0.7 } : undefined}
        >
          <StopIcon stop={stop} />
        </button>
        {stop.kind === "lesson" && stop.state === "done" && stop.node && (
          <span className="absolute -bottom-6 left-1/2 flex -translate-x-1/2 gap-0.5 text-[var(--u2)]" aria-hidden>
            {[1, 2, 3].map((n) => (
              <StarIcon key={n} filled={n <= stop.node!.stars} className="size-3.5" />
            ))}
          </span>
        )}
      </div>
    </li>
  );
}

/** One unit: the sticky coloured banner, then its stops on a gentle zig-zag with Myna sitting in the curve. */
export function UnitSection({
  unit,
  stops,
  onOpen,
  onStop,
  onGuide,
  currentRef,
  first,
}: {
  unit: PathUnit;
  stops: PathStop[];
  onOpen: (n: PathNode) => void;
  onStop: (s: PathStop, unit: PathUnit) => void;
  onGuide: (unit: PathUnit) => void;
  currentRef?: Ref<HTMLLIElement>;
  first: boolean;
}) {
  const lang = useLang();
  const headingId = `unit-${unit.id}`;
  const h = columnHeight(stops.length);
  // Myna sits beside the 2nd-3rd stops, on the side the path bends away from
  const anchor = Math.min(2, stops.length - 1);
  const side = nodeOffset(anchor) >= 0 ? "left" : "right";

  return (
    <section aria-labelledby={headingId} className="w-full" style={unitColor(unit.number)}>
      {!first && (
        <div className="mb-6 flex items-center gap-3 px-2 text-muted" aria-hidden>
          <span className="h-0.5 flex-1 bg-line" />
          <span className="text-center text-base font-extrabold">
            <Bi text={unit.title} className="items-center" />
          </span>
          <span className="h-0.5 flex-1 bg-line" />
        </div>
      )}

      <div className={`unit-banner sticky top-[3.6rem] z-10 flex items-stretch overflow-hidden rounded-2xl ${unit.locked ? "grayscale" : ""}`}>
        <div className="min-w-0 flex-1 px-4 py-3">
          <p className="text-xs font-black uppercase tracking-wider text-white/80">
            {lang === "th" ? `ยูนิต ${unit.number}` : `Unit ${unit.number}`} · {unit.doneCount}/{unit.total}
          </p>
          <h2 id={headingId} className="text-lg font-black leading-tight">
            <Bi text={unit.title} subClassName="text-white/80!" />
          </h2>
        </div>
        <button
          type="button"
          onClick={() => onGuide(unit)}
          aria-label={lang === "th" ? `คู่มือยูนิต ${unit.number}` : `Unit ${unit.number} guidebook`}
          className="flex w-16 shrink-0 items-center justify-center border-l-2 border-black/10 hover:bg-white/10"
        >
          <svg viewBox="0 0 24 24" className="size-7" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <rect x="5" y="3" width="14" height="18" rx="2.5" fill="currentColor" fillOpacity="0.25" />
            <path d="M9 8h6M9 12h6M9 16h4M3.5 7h2M3.5 12h2M3.5 17h2" />
          </svg>
        </button>
      </div>

      <div className="relative mx-auto mt-14 w-full max-w-80" style={{ height: h + 20 }}>
        {stops.length > 2 && (
          <div
            className="pointer-events-none absolute w-24 sm:w-28"
            style={{ top: anchor * ROW_HEIGHT + CIRCLE_CENTRE_Y - 40, [side]: "-0.5rem" }}
            aria-hidden
          >
            <MynaBot mood={unit.locked ? "sleepy" : MOODS[(unit.number - 1) % MOODS.length]} className="w-full" />
          </div>
        )}
        <ol className="m-0 list-none p-0">
          {stops.map((s, i) => (
            <Stop key={s.key} stop={s} unit={unit} index={i} onOpen={onOpen} onStop={onStop} currentRef={currentRef} />
          ))}
        </ol>
      </div>
    </section>
  );
}

"use client";

import { useId } from "react";

/**
 * Melobi the bot: an original glossy violet orb with pill eyes. The mood picks the face (CSS in globals.css) and restarts
 * the body animation. Decorative: always aria-hidden; say the result in text next to it.
 */
export type BotMood = "idle" | "watch" | "wink" | "happy" | "perfect" | "surprised" | "sad" | "thinking" | "listening" | "sleepy";

const MOUTH: Record<BotMood, string> = {
  idle: "M53 80q7 5 14 0",
  watch: "M54 80q6 3.5 12 0",
  wink: "M50 78q10 10 20 0",
  happy: "M47 76q13 15 26 0",
  perfect: "M45 75q15 18 30 0",
  sad: "M51 85q9-8 18 0",
  thinking: "M55 82h9",
  sleepy: "M55 82q5 2.5 10 0",
  listening: "M60 77.5a4.5 5 0 1 0 .01 0",
  surprised: "M60 75a6.5 8 0 1 0 .01 0",
};

function starPath(cx: number, cy: number, r: number): string {
  let d = "";
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.45 : r;
    d += (k ? "L" : "M") + (cx + rr * Math.cos(a)).toFixed(1) + " " + (cy + rr * Math.sin(a)).toFixed(1);
  }
  return d + "Z";
}
const sparkPath = (x: number, y: number, r: number) =>
  `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`;
const STAR_L = starPath(47.5, 56, 12);
const STAR_R = starPath(72.5, 56, 12);

export function MynaBot({
  mood = "idle",
  look,
  className = "h-16 w-16",
}: {
  mood?: BotMood;
  /** Where the eyes look (px in the bot's own 120-unit box), for "watch". */
  look?: { x: number; y: number } | null;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const body = `botBody${uid}`;
  const rim = `botRim${uid}`;
  const style = mood === "watch" && look ? ({ "--lx": `${look.x.toFixed(1)}px`, "--ly": `${look.y.toFixed(1)}px` } as React.CSSProperties) : undefined;
  const o = mood === "listening" || mood === "surprised";
  return (
    <svg className={`bot ${className}`} data-mood={mood} viewBox="-10 -16 140 144" aria-hidden focusable="false" style={style}>
      <defs>
        <radialGradient id={body} cx="38%" cy="30%" r="75%">
          <stop offset="0" stopColor="#a99bff" />
          <stop offset=".45" stopColor="#6f55f2" />
          <stop offset="1" stopColor="#3f25b8" />
        </radialGradient>
        <radialGradient id={rim} cx="50%" cy="50%" r="50%">
          <stop offset=".72" stopColor="#2a1580" stopOpacity="0" />
          <stop offset="1" stopColor="#2a1580" stopOpacity=".45" />
        </radialGradient>
      </defs>
      <ellipse cx="60" cy="118" rx="30" ry="5" fill="#000" opacity=".16" />
      <g className="fx">
        <circle className="ring" cx="60" cy="60" r="52" fill="none" stroke="#7d66f5" strokeWidth="3" />
        <circle className="ring r2" cx="60" cy="60" r="52" fill="none" stroke="#7d66f5" strokeWidth="3" />
      </g>
      {/* keyed by mood so the body animation restarts on every change */}
      <g className="b-body" key={mood}>
        <circle cx="60" cy="60" r="48" fill={`url(#${body})`} />
        <circle className="b-shade" cx="60" cy="60" r="48" fill={`url(#${rim})`} />
        <ellipse cx="40" cy="32" rx="15" ry="8" fill="#fff" opacity=".42" transform="rotate(-24 40 32)" />
        <ellipse className="cheek" cx="31" cy="75" rx="8" ry="4.5" />
        <ellipse className="cheek" cx="89" cy="75" rx="8" ry="4.5" />
        <g className="b-face">
          <g className="eyes-pill">
            <rect className="eye l" x="42" y="44" width="11" height="24" rx="5.5" />
            <rect className="eye r" x="67" y="44" width="11" height="24" rx="5.5" />
          </g>
          <g className="eyes-arc">
            <path d="M41 60q6.5-12 13 0" />
            <path d="M66 60q6.5-12 13 0" />
          </g>
          <g className="eyes-wink">
            <rect className="eye" x="42" y="44" width="11" height="24" rx="5.5" />
            <path d="M66 58q6.5-9 13 0" />
          </g>
          <g className="eyes-star">
            <path d={STAR_L} />
            <path d={STAR_R} />
          </g>
          <path className={`mouth ${o ? "o" : ""}`} d={MOUTH[mood]} />
        </g>
        <g className="fx">
          <path className="drop" d="M90 64q5 8 0 10.5q-5-2.5 0-10.5z" fill="#8fd0ff" />
          <circle className="dot" cx="94" cy="16" r="3.4" fill="#a99bff" />
          <circle className="dot d2" cx="104" cy="7" r="4" fill="#a99bff" />
          <circle className="dot d3" cx="115" cy="-3" r="4.6" fill="#a99bff" />
          <text className="z" x="92" y="20" fontSize="17" fontWeight="900" fill="#a99bff">
            z
          </text>
          <text className="z z2" x="102" y="8" fontSize="13" fontWeight="900" fill="#a99bff">
            z
          </text>
          <path className="spark" d={sparkPath(10, 14, 9)} fill="#ffd23f" />
          <path className="spark s2" d={sparkPath(110, 22, 8)} fill="#ffd23f" />
          <path className="spark s3" d={sparkPath(106, 100, 7)} fill="#7be0a4" />
        </g>
      </g>
    </svg>
  );
}

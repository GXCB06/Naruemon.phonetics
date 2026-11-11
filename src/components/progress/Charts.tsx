"use client";

import { Bi, useLang } from "@/components/home/lang";
import { BoltIcon, FlameIcon } from "@/components/home/icons";
import { MynaBot } from "@/components/mascot/MynaBot";
import type { Progress } from "@/lib/progress/store";
import { weakestAxis, weekSummary, type RadarAxis, type WeekDay } from "@/lib/progress/skills";

// Inline SVG, no chart library: the skills radar and the week of practice.

const CX = 160;
const CY = 150;
const R = 96;

function point(i: number, n: number, r: number): [number, number] {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}
const poly = (pts: [number, number][]) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

/** Eight spokes: how strong each tune and each way of practising is. An empty spoke means "not enough data yet". */
export function SkillsRadar({ axes }: { axes: RadarAxis[] }) {
  const lang = useLang();
  const n = axes.length;
  const weak = weakestAxis(axes);
  const data = axes.map((a, i) => point(i, n, (R * (a.value ?? 0)) / 100));
  const any = axes.some((a) => a.value !== null);
  return (
    <section aria-labelledby="radar-title" className="card flex flex-col gap-3 p-4">
      <h2 id="radar-title" className="text-xl font-black">
        <Bi text={{ en: "Your skills", th: "ทักษะของคุณ" }} />
      </h2>
      <svg viewBox="-40 0 400 300" className="mx-auto block h-auto w-full max-w-sm" role="img" aria-label={axes.map((a) => `${a.label[lang]}: ${a.value ?? "—"}`).join(", ")}>
        {[25, 50, 75, 100].map((ring) => (
          <polygon key={ring} points={poly(axes.map((_, i) => point(i, n, (R * ring) / 100)))} fill="none" stroke="var(--line)" strokeWidth={ring === 100 ? 2 : 1.5} />
        ))}
        {axes.map((_, i) => {
          const [x, y] = point(i, n, R);
          return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="var(--line)" strokeWidth="1.5" />;
        })}
        {any && <polygon points={poly(data)} fill="var(--accent)" fillOpacity="0.28" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round" />}
        {axes.map((a, i) => {
          const [x, y] = data[i];
          return a.value === null ? (
            <circle key={a.id} cx={CX} cy={CY} r="0" />
          ) : (
            <circle key={a.id} cx={x} cy={y} r="5" fill={weak?.id === a.id ? "var(--warn)" : "var(--accent)"} stroke="var(--card)" strokeWidth="2" />
          );
        })}
        {axes.map((a, i) => {
          const [x, y] = point(i, n, R + 24);
          const anchor = Math.abs(x - CX) < 6 ? "middle" : x > CX ? "start" : "end";
          return (
            <text key={a.id} x={x} y={y + 4} textAnchor={anchor} fontSize="13" fontWeight="800" fill={a.value === null ? "var(--muted)" : "var(--ink)"} style={{ fontFamily: "var(--nf-ui), var(--nf-thai), sans-serif" }}>
              {a.label[lang]}
              {a.value !== null && <tspan fill="var(--muted)"> {a.value}</tspan>}
            </text>
          );
        })}
      </svg>
      <p className="text-sm font-semibold text-muted" role="status">
        {!any ? (
          <Bi text={{ en: "Practise a little more and your skills will appear here. Each spoke needs 5 tries.", th: "ฝึกอีกนิด แล้วทักษะของคุณจะแสดงที่นี่ แต่ละด้านต้องลองอย่างน้อย 5 ครั้ง" }} />
        ) : weak ? (
          <Bi
            text={{ en: `${weak.label.en} needs the most attention (${weak.value}).`, th: `ด้าน ${weak.label.th} ควรฝึกเพิ่มที่สุด (${weak.value})` }}
          />
        ) : null}
      </p>
    </section>
  );
}

const DAY_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

/** The last 7 days: one bar per day for how many exercises were done. */
export function WeekBars({ days }: { days: WeekDay[] }) {
  const lang = useLang();
  const s = weekSummary(days);
  return (
    <section aria-labelledby="week-title" className="card flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="week-title" className="text-xl font-black">
          <Bi text={{ en: "This week", th: "สัปดาห์นี้" }} />
        </h2>
        <p className="text-sm font-extrabold text-muted">{lang === "th" ? `${s.total} ข้อ · ${s.activeDays}/7 วัน` : `${s.total} exercises · ${s.activeDays}/7 days`}</p>
      </div>
      <ul className="grid grid-cols-7 items-end gap-2" aria-label={days.map((d) => `${(lang === "th" ? DAY_TH : DAY_EN)[d.weekday]}: ${d.count}`).join(", ")}>
        {days.map((d) => (
          <li key={d.day} className="flex flex-col items-center gap-1.5">
            <span className="text-xs font-extrabold tabular-nums text-muted">{d.count || ""}</span>
            <span className="flex h-24 w-full items-end overflow-hidden rounded-xl bg-line/60" aria-hidden>
              <span
                className={`block w-full rounded-xl ${d.isToday ? "bg-warn" : "bg-accent"}`}
                style={{ height: d.count ? `${Math.max(12, Math.round((d.count / s.max) * 100))}%` : "0%" }}
              />
            </span>
            <span className={`text-xs font-extrabold ${d.isToday ? "text-warn" : "text-muted"}`}>{(lang === "th" ? DAY_TH : DAY_EN)[d.weekday]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Streak, XP and finished lessons at the top of Progress. */
export function SummaryTiles({ progress, streak }: { progress: Progress; streak: number }) {
  const done = Object.keys(progress.lessons).filter((k) => !k.startsWith("drill-") && !k.startsWith("speak:")).length;
  const tile = (icon: React.ReactNode, value: number, label: { en: string; th: string }) => (
    <div className="card flex flex-col items-center gap-1 p-3 text-center">
      <span aria-hidden className="flex h-7 items-center">
        {icon}
      </span>
      <span className="text-3xl font-black tabular-nums leading-none">{value}</span>
      <span className="text-xs font-extrabold uppercase tracking-wide text-muted">
        <Bi text={label} className="items-center" />
      </span>
    </div>
  );
  return (
    <section aria-label="Summary · สรุป" className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <MynaBot mood={streak > 0 ? "happy" : "wink"} className="size-16 shrink-0" />
        <p className="text-lg font-black leading-snug">
          <Bi
            text={
              streak >= 3
                ? { en: `${streak} days in a row. Keep it going!`, th: `ต่อเนื่อง ${streak} วันแล้ว รักษาไว้นะ!` }
                : streak > 0
                  ? { en: "Nice start. Come back tomorrow!", th: "เริ่มต้นได้ดี พรุ่งนี้มาต่อนะ!" }
                  : { en: "Let's practise today!", th: "มาฝึกกันวันนี้!" }
            }
          />
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {tile(<FlameIcon className="size-7" />, streak, { en: "Streak", th: "ต่อเนื่อง" })}
        {tile(<BoltIcon className="size-7" />, progress.xp, { en: "XP", th: "XP" })}
        {tile(<span className="text-2xl">✅</span>, done, { en: "Lessons", th: "บทเรียน" })}
      </div>
    </section>
  );
}

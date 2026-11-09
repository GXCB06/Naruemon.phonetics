"use client";

import { Bi, useLang, useText } from "@/components/home/lang";
import type { FirstLatest, TrendDay } from "@/lib/progress/view.ts";
import { COPY } from "./copy";

// A plain inline-SVG line (no chart library). Days with no attempts are gaps: the line joins the days that have data.

const W = 300;
const H = 120;
const PAD = { l: 26, r: 8, t: 8, b: 8 };

function x(i: number, n: number): number {
  return PAD.l + (n <= 1 ? 0 : (i * (W - PAD.l - PAD.r)) / (n - 1));
}
function y(v: number): number {
  return PAD.t + ((100 - v) * (H - PAD.t - PAD.b)) / 100;
}

function useDayLabel() {
  const lang = useLang();
  return (day: string) => {
    const [yy, mm, dd] = day.split("-").map(Number);
    return new Date(yy, mm - 1, dd).toLocaleDateString(lang === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short" });
  };
}

export function TrendChart({ days }: { days: TrendDay[] }) {
  const text = useText();
  const label = useDayLabel();
  const withData = days.map((d, i) => ({ ...d, i })).filter((d) => d.average !== null);
  const total = withData.reduce((n, d) => n + d.count, 0);

  if (withData.length === 0) {
    return (
      <p role="status" className="text-sm font-bold text-muted">
        <Bi text={COPY.trend.none} />
      </p>
    );
  }

  const mean = Math.round(withData.reduce((n, d) => n + (d.average ?? 0) * d.count, 0) / total);
  const points = withData.map((d) => `${x(d.i, days.length).toFixed(1)},${y(d.average ?? 0).toFixed(1)}`).join(" ");
  const summary = `${text(COPY.trend.last14)}: ${total} ${text(COPY.trend.attemptsIn14)}, ${text(COPY.trend.average)} ${mean}`;

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm font-bold">
        <Bi text={COPY.trend.last14} />
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="h-auto w-full max-w-xl">
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--level-line)" strokeWidth={1} strokeDasharray={v === 50 ? "3 3" : undefined} />
            <text x={PAD.l - 4} y={y(v) + 3} textAnchor="end" fontSize={9} fill="var(--muted)">
              {v}
            </text>
          </g>
        ))}
        {withData.length > 1 && <polyline points={points} fill="none" stroke="var(--learner)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
        {withData.map((d) => (
          <circle key={d.day} cx={x(d.i, days.length)} cy={y(d.average ?? 0)} r={3.5} fill="var(--card)" stroke="var(--learner)" strokeWidth={2.5} />
        ))}
      </svg>
      <div className="flex max-w-xl justify-between pl-[8.7%] text-xs font-semibold text-muted" aria-hidden>
        <span>{label(days[0].day)}</span>
        <span>{label(days[days.length - 1].day)}</span>
      </div>
      <p className="text-xs font-bold text-muted">
        <span className="tabular-nums text-ink">{total}</span> {text(COPY.trend.attemptsIn14)} · {text(COPY.trend.average)}{" "}
        <span className="tabular-nums text-ink">{mean}</span>/100
      </p>
      {/* The same numbers as text, for screen readers: the days that have attempts. */}
      <ul className="sr-only">
        {withData.map((d) => (
          <li key={d.day}>
            {label(d.day)}: {d.average}/100 ({d.count})
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function FirstLatestList({ rows }: { rows: FirstLatest[] }) {
  const text = useText();

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-base font-black">
        <Bi text={COPY.trend.firstLatest} />
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm font-semibold text-muted">
          <Bi text={COPY.trend.firstLatestNone} />
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => {
            const sign = r.delta > 0 ? "+" : r.delta < 0 ? "−" : "±";
            const arrow = r.delta > 0 ? "▲" : r.delta < 0 ? "▼" : "■";
            return (
              <li key={r.pattern} className="flex items-center justify-between gap-3 rounded-xl border-2 border-line bg-bg px-3 py-2">
                <span className="min-w-0 text-sm font-extrabold">
                  <Bi text={r.label} />
                </span>
                <span className="shrink-0 text-right text-sm font-bold">
                  <span className="sr-only">
                    {text(COPY.trend.first)} {r.first}, {text(COPY.trend.latest)} {r.latest}, {sign}
                    {Math.abs(r.delta)}
                  </span>
                  <span aria-hidden className="tabular-nums">
                    {r.first} → {r.latest}
                  </span>
                  <span aria-hidden className={`ml-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-extrabold tabular-nums ${r.delta > 0 ? "bg-good-soft text-good" : r.delta < 0 ? "bg-bad-soft text-bad" : "bg-line text-muted"}`}>
                    {arrow} {sign}
                    {Math.abs(r.delta)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function Trend({ days, firstLatest }: { days: TrendDay[]; firstLatest: FirstLatest[] }) {
  return (
    <section aria-labelledby="trend-title" className="flex flex-col gap-4">
      <h2 id="trend-title" className="text-xl font-black">
        <Bi text={COPY.trend.title} />
      </h2>
      <div className="card flex flex-col gap-5 p-4">
        <TrendChart days={days} />
        <FirstLatestList rows={firstLatest} />
        <p className="text-xs font-semibold text-muted">
          <Bi text={COPY.trend.note} />
        </p>
      </div>
    </section>
  );
}

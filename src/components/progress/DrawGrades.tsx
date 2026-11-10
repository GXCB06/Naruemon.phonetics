"use client";

import { Bi, useText } from "@/components/home/lang";
import type { DrawGradeRow } from "@/lib/progress/view.ts";
import { COPY } from "./copy";
import { PencilIcon } from "./icons";

const SEGMENTS = [
  { key: "perfect", bar: "bg-good", text: "text-good" },
  { key: "good", bar: "bg-accent", text: "text-accent" },
  { key: "miss", bar: "bg-line", text: "text-muted" },
] as const;

/** Perfect / Good / Miss counts of Draw it, per pattern. */
export function DrawGrades({ rows }: { rows: DrawGradeRow[] }) {
  const text = useText();

  return (
    <section aria-labelledby="grades-title" className="flex flex-col gap-3">
      <div>
        <h2 id="grades-title" className="flex items-center gap-2 text-xl font-black">
          <PencilIcon className="size-5 text-muted" />
          <Bi text={COPY.grades.title} />
        </h2>
        <p className="mt-1 text-sm font-semibold text-muted">
          <Bi text={COPY.grades.intro} subClassName="text-[0.85em]" />
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <li key={row.pattern} className="card flex flex-col gap-2 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-black text-muted">
                <Bi text={row.label} />
              </p>
              <p className="shrink-0 text-xs font-bold text-muted">
                <span className="tabular-nums text-ink">{row.total}</span> {text(COPY.grades.drawings)}
              </p>
            </div>
            <span aria-hidden className="flex h-2.5 overflow-hidden rounded-full bg-line">
              {SEGMENTS.map((s) =>
                row.counts[s.key] > 0 ? (
                  <span key={s.key} className={`block h-full ${s.bar}`} style={{ width: `${(row.counts[s.key] / row.total) * 100}%` }} />
                ) : null,
              )}
            </span>
            <dl className="grid grid-cols-3 gap-2 text-center">
              {SEGMENTS.map((s) => (
                <div key={s.key}>
                  <dt className="text-xs font-extrabold text-muted">{text(COPY.grades[s.key])}</dt>
                  <dd className={`text-2xl font-black tabular-nums ${s.text}`}>{row.counts[s.key]}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs font-bold text-muted">
              {text(COPY.grades.rate)}: <span className="tabular-nums text-ink">{row.rate}%</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

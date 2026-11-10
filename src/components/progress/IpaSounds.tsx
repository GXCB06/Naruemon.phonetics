"use client";

import Link from "next/link";
import { Bi, useText } from "@/components/home/lang";
import type { IpaProgress } from "@/lib/progress/view.ts";
import { COPY } from "./copy";

/** IPA practice results: how many words, how often right, and the sounds the learner mixes up most. */
export function IpaSounds({ data }: { data: IpaProgress }) {
  const text = useText();
  const stats = [
    { label: COPY.ipa.words, value: data.attempts },
    { label: COPY.ipa.different, value: data.distinctWords },
    { label: COPY.ipa.rate, value: `${data.rate}%` },
  ];

  return (
    <section aria-labelledby="ipa-title" className="flex flex-col gap-3">
      <h2 id="ipa-title" className="text-xl font-black">
        <Bi text={COPY.ipa.title} />
      </h2>

      <dl className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label.en} className="card p-3 text-center">
            <dt className="text-xs font-extrabold text-muted">
              <Bi text={s.label} className="items-center" />
            </dt>
            <dd className="text-2xl font-black tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs font-bold text-muted">
        {text(COPY.grades.perfect)} <span className="tabular-nums text-ink">{data.counts.perfect}</span> · {text(COPY.grades.good)}{" "}
        <span className="tabular-nums text-ink">{data.counts.good}</span> · {text(COPY.grades.miss)}{" "}
        <span className="tabular-nums text-ink">{data.counts.miss}</span>
      </p>

      <div className="card flex flex-col gap-3 p-4">
        <h3 className="text-base font-black">
          <Bi text={COPY.ipa.weakTitle} />
        </h3>
        {data.weak.length === 0 ? (
          <p role="status" className="text-sm font-bold">
            <Bi text={COPY.ipa.noWeak} />
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.weak.map((w) => (
              <li key={w.symbol} className="flex items-center gap-3">
                <span aria-hidden className="ipa flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border-2 border-line bg-bg px-2 text-2xl">
                  {w.symbol}
                </span>
                <span className="min-w-0 flex-1 text-sm font-extrabold leading-snug">
                  <Bi text={w.sentence} />
                </span>
                <span className="shrink-0 text-xs font-bold text-muted">
                  <span className="tabular-nums text-ink">{w.accuracy}%</span> {text(COPY.ipa.right)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link href={data.href} className="btn btn-primary min-h-12 self-stretch text-sm sm:self-start">
          <Bi text={data.weak.length ? COPY.ipa.practise : COPY.ipa.practiseMore} className="items-center" subClassName="text-primary-ink/80" />
        </Link>
      </div>
    </section>
  );
}

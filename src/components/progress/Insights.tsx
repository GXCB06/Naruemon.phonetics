"use client";

import { Bi, useText } from "@/components/home/lang";
import type { PatternInsight } from "@/lib/progress/view.ts";
import { COPY } from "./copy";
import { BandIcon, ModalityIcon } from "./icons";

function Meter({ modality, label, value }: { modality: "draw" | "speak"; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-sm font-bold">
      <span className="flex w-24 shrink-0 items-center gap-1.5">
        <ModalityIcon modality={modality} className="size-4 text-muted" />
        {label}
      </span>
      <span aria-hidden className="h-2.5 flex-1 overflow-hidden rounded-full bg-line">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </span>
      <span className="w-8 text-right tabular-nums">{value}</span>
    </div>
  );
}

export function Insights({ items }: { items: PatternInsight[] }) {
  const text = useText();

  return (
    <section aria-labelledby="insight-title" className="flex flex-col gap-3">
      <div>
        <h2 id="insight-title" className="text-xl font-black">
          <Bi text={COPY.insight.title} />
        </h2>
        <p className="mt-1 text-sm font-semibold text-muted">
          <Bi text={COPY.insight.intro} subClassName="text-[0.85em]" />
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map(({ pattern, label, insight }) => (
          <li key={pattern} className="card flex flex-col gap-2 p-4">
            <p className="text-sm font-black text-muted">
              <Bi text={label} />
            </p>
            {insight ? (
              <>
                <p className="flex items-start gap-2 text-base font-extrabold leading-snug">
                  <BandIcon
                    band={insight.state === "mastered" ? "high" : insight.state === "review-unit" ? "low" : "mid"}
                    className="mt-0.5 size-5 shrink-0"
                  />
                  <Bi text={insight.text} />
                </p>
                <Meter modality="draw" label={text(COPY.insight.drawing)} value={insight.draw} />
                <Meter modality="speak" label={text(COPY.insight.speaking)} value={insight.speak} />
              </>
            ) : (
              <p className="text-sm font-semibold text-muted">
                <Bi text={COPY.insight.notYet} />
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

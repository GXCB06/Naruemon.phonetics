"use client";

import Link from "next/link";
import { Bi, useText } from "@/components/home/lang";
import { MODALITY_LABEL, type Improvement } from "@/lib/progress/view.ts";
import type { MasteryModality } from "@/lib/mastery/mastery.ts";
import { COPY } from "./copy";
import { ModalityIcon } from "./icons";

export function Improvements({ items, hasEnoughSomewhere }: { items: Improvement[]; hasEnoughSomewhere: boolean }) {
  const text = useText();

  return (
    <section aria-labelledby="improve-title" className="flex flex-col gap-3">
      <h2 id="improve-title" className="text-xl font-black">
        <Bi text={COPY.improve.title} />
      </h2>

      {items.length === 0 ? (
        <p role="status" className="card p-4 text-sm font-bold">
          <Bi text={hasEnoughSomewhere ? COPY.improve.allStrong : COPY.improve.none} />
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((item, i) => {
            const modality = item.modality as MasteryModality;
            const label = MODALITY_LABEL[modality];
            return (
              <li key={`${item.pattern}|${item.skill}|${item.modality}`} className="card flex flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-base font-black text-primary-ink">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-extrabold leading-snug">
                      <Bi text={item.sentence} />
                    </p>
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-muted">
                      {label && (
                        <span className="inline-flex items-center gap-1">
                          <ModalityIcon modality={modality} className="size-4" />
                          {text(label)}
                        </span>
                      )}
                      <span>
                        {text(COPY.improve.score)} <span className="tabular-nums text-ink">{item.score}</span>/100
                      </span>
                    </p>
                  </div>
                </div>
                <Link href={item.target.href} className="btn btn-primary min-h-12 self-stretch text-sm sm:self-start">
                  <Bi text={COPY.improve.practice} className="items-center" subClassName="text-primary-ink/80" />
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

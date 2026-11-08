"use client";

import { Bi, useText } from "@/components/home/lang";
import { MIN_ATTEMPTS } from "@/lib/mastery/mastery.ts";
import { BAND_LABEL, MODALITY_LABEL, SKILL_LABEL, type Band, type HeatPart, type HeatRow } from "@/lib/progress/view.ts";
import { COPY } from "./copy";
import { BandIcon, ModalityIcon } from "./icons";

// Colour AND a symbol AND (when there is one) the number: nothing is carried by colour alone.
const BAND_STYLE: Record<Band, string> = {
  high: "border-good bg-good-soft",
  mid: "border-warn bg-warn-soft",
  low: "border-bad bg-bad-soft",
  few: "border-dashed border-line bg-bg",
  none: "border-line bg-card text-muted",
};
const BAND_ICON_COLOR: Record<Band, string> = {
  high: "text-good",
  mid: "text-warn",
  low: "text-bad",
  few: "text-muted",
  none: "text-muted",
};

const BANDS: Band[] = ["high", "mid", "low", "few", "none"];

function Part({ part }: { part: HeatPart }) {
  const text = useText();
  const shown = part.score !== null ? String(part.score) : part.band === "few" ? `${part.attemptsN}/${MIN_ATTEMPTS}` : "–";
  const spoken =
    part.score !== null
      ? `${text(MODALITY_LABEL[part.modality])}: ${part.score} ${text(COPY.heat.outOf)}, ${text(BAND_LABEL[part.band])}`
      : part.band === "few"
        ? `${text(MODALITY_LABEL[part.modality])}: ${text(BAND_LABEL.few)} (${part.attemptsN}/${MIN_ATTEMPTS} ${text(COPY.heat.attempts)})`
        : `${text(MODALITY_LABEL[part.modality])}: ${text(BAND_LABEL.none)}`;

  return (
    <li className={`flex items-center justify-between gap-1 rounded-lg border-2 px-1.5 py-1 text-sm font-extrabold ${BAND_STYLE[part.band]}`}>
      <span aria-hidden className="flex items-center gap-1">
        <ModalityIcon modality={part.modality} className="size-4 shrink-0 text-muted" />
        <span className="tabular-nums">{shown}</span>
        <BandIcon band={part.band} className={`size-4 shrink-0 ${BAND_ICON_COLOR[part.band]}`} />
      </span>
      <span className="sr-only">{spoken}</span>
    </li>
  );
}

export function HeatMap({ rows }: { rows: HeatRow[] }) {
  const text = useText();
  const skills = rows[0]?.cells.map((c) => c.skill) ?? [];

  return (
    <section aria-labelledby="heat-title" className="flex flex-col gap-3">
      <div>
        <h2 id="heat-title" className="text-xl font-black">
          <Bi text={COPY.heat.title} />
        </h2>
        <p className="mt-1 text-sm font-semibold text-muted">
          <Bi text={COPY.heat.intro} subClassName="text-[0.85em]" />
        </p>
      </div>

      {/* Keyboard focusable so the sideways scroll works without a mouse. */}
      <div
        role="region"
        aria-label={text(COPY.heat.region)}
        tabIndex={0}
        className="overflow-x-auto rounded-2xl border-2 border-line bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <table className="w-full min-w-[44rem] border-separate border-spacing-1 text-left">
          <caption className="sr-only">{text(COPY.heat.caption)}</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 min-w-24 bg-card px-1 py-2 align-bottom text-xs font-extrabold text-muted">
                <Bi text={COPY.heat.pattern} />
              </th>
              {skills.map((skill) => (
                <th key={skill} scope="col" className="px-1 py-2 align-bottom text-center text-xs font-extrabold">
                  <Bi text={SKILL_LABEL[skill]} className="items-center" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.pattern}>
                <th scope="row" className="sticky left-0 z-10 min-w-24 bg-card px-1 py-1 align-middle text-sm font-black">
                  <Bi text={row.label} />
                </th>
                {row.cells.map((cell) => (
                  <td key={cell.skill} className="min-w-24 p-0 align-top">
                    <ul className="flex flex-col gap-1">
                      {cell.parts.map((part) => (
                        <Part key={part.modality} part={part} />
                      ))}
                    </ul>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs font-semibold text-muted sm:hidden">
        <Bi text={COPY.heat.scroll} />
      </p>

      <ul aria-label={text(COPY.heat.legend)} className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold">
        {BANDS.map((band) => (
          <li key={band} className="flex items-center gap-1.5">
            <span aria-hidden className={`flex size-6 items-center justify-center rounded-md border-2 ${BAND_STYLE[band]}`}>
              <BandIcon band={band} className={`size-3.5 ${BAND_ICON_COLOR[band]}`} />
            </span>
            <span>{text(BAND_LABEL[band])}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

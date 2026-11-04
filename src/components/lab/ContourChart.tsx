"use client";

import type { ReactNode } from "react";
import { CHART, levelToY } from "@/lib/intonation/drawing";
import type { Contour, Layout } from "@/lib/intonation/types";

export const LABEL_H = 46;

export interface ChartLine {
  contour: Contour;
  color: string;
  width?: number;
  dashed?: boolean;
  label?: string;
}

/** Path for a contour; nulls break the line. */
export function contourPath(c: Contour): string {
  let d = "";
  let pen = false;
  for (const p of c) {
    if (p.v === null) {
      pen = false;
      continue;
    }
    const x = (p.t * CHART.width).toFixed(1);
    const y = levelToY(p.v).toFixed(1);
    d += `${pen ? "L" : "M"}${x} ${y} `;
    pen = true;
  }
  return d.trim();
}

/**
 * The textbook-style chart: four level lines, a column per syllable, the target line and the learner's line.
 * `children` are drawn on top (the drawing pad puts its ink there).
 */
export function ContourChart({
  layout,
  lines,
  children,
  showSyllables = true,
  className,
  svgProps,
}: {
  layout: Layout;
  lines: ChartLine[];
  children?: ReactNode;
  showSyllables?: boolean;
  className?: string;
  svgProps?: React.SVGProps<SVGSVGElement>;
}) {
  const h = CHART.height + (showSyllables ? LABEL_H : 0);
  return (
    <svg
      viewBox={`0 0 ${CHART.width} ${h}`}
      className={className}
      role="img"
      aria-label="Pitch chart with levels 1 to 4"
      {...svgProps}
    >
      {/* syllable columns */}
      {layout.slots.map((s, i) => (
        <rect
          key={i}
          x={s.start * CHART.width}
          y={0}
          width={(s.end - s.start) * CHART.width}
          height={CHART.height}
          fill={s.isNucleus ? "var(--primary)" : i % 2 ? "var(--line)" : "transparent"}
          opacity={s.isNucleus ? 0.18 : 0.35}
        />
      ))}
      {/* thought-group separators */}
      {layout.groupSpans.slice(0, -1).map((g, i) => {
        const x = ((g.end + layout.groupSpans[i + 1].start) / 2) * CHART.width;
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={8} y2={CHART.height - 8} stroke="var(--muted)" strokeDasharray="6 6" strokeWidth={2} />
            <text x={x} y={CHART.height - 2} textAnchor="middle" fontSize={18} fill="var(--muted)" fontWeight={800}>
              |
            </text>
          </g>
        );
      })}
      {/* level lines */}
      {[1, 2, 3, 4].map((l) => (
        <g key={l}>
          <line x1={0} x2={CHART.width} y1={levelToY(l)} y2={levelToY(l)} stroke="var(--level-line)" strokeWidth={2} />
          <text x={8} y={levelToY(l) - 6} fontSize={16} fontWeight={800} fill="var(--muted)">
            {l}
          </text>
        </g>
      ))}
      {lines.map((ln, i) => (
        <path
          key={i}
          d={contourPath(ln.contour)}
          fill="none"
          stroke={ln.color}
          strokeWidth={ln.width ?? 5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={ln.dashed ? "10 10" : undefined}
        />
      ))}
      {children}
      {showSyllables &&
        layout.slots.map((s, i) => (
          <text
            key={i}
            x={((s.start + s.end) / 2) * CHART.width}
            y={CHART.height + 30}
            textAnchor="middle"
            fontSize={s.isNucleus ? 24 : 20}
            fontWeight={s.isNucleus ? 900 : s.syllable.stressed ? 800 : 500}
            fill={s.isNucleus ? "var(--ink)" : "var(--muted)"}
          >
            {s.isNucleus ? s.syllable.text.toUpperCase() : s.syllable.text}
          </text>
        ))}
    </svg>
  );
}

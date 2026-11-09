// Small inline SVG icons for the My Progress screen, drawn for Myna. They carry meaning next to colour:
// a heat-map cell is never "just green", it also has a symbol and a number.

import type { Band } from "@/lib/progress/view.ts";
import type { MasteryModality } from "@/lib/mastery/mastery.ts";

type P = { className?: string };
const base = { viewBox: "0 0 24 24", "aria-hidden": true, focusable: false, fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function MicIcon({ className = "size-4" }: P) {
  return (
    <svg {...base} className={className}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
    </svg>
  );
}

export function PencilIcon({ className = "size-4" }: P) {
  return (
    <svg {...base} className={className}>
      <path d="m4 20 1-4.5L16.5 4a2.1 2.1 0 0 1 3 3L8 18.5 4 20Z" />
      <path d="m14.5 6 3.5 3.5" />
    </svg>
  );
}

export function EarIcon({ className = "size-4" }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M7 10a5 5 0 0 1 10 0c0 2.6-2.4 3.4-2.4 5.6A2.6 2.6 0 0 1 9.4 16" />
      <path d="M10.5 10a1.6 1.6 0 0 1 3.2 0c0 1-1 1.3-1.4 2.2" />
    </svg>
  );
}

export function ModalityIcon({ modality, className }: { modality: MasteryModality } & P) {
  if (modality === "speak") return <MicIcon className={className} />;
  if (modality === "draw") return <PencilIcon className={className} />;
  return <EarIcon className={className} />;
}

/** One symbol per band, so the heat map reads without colour: ✓ strong, ~ getting there, ! needs work, … few, – none. */
export function BandIcon({ band, className = "size-4" }: { band: Band } & P) {
  switch (band) {
    case "high":
      return (
        <svg {...base} className={className}>
          <path d="m5 12.5 4.5 4.5L19 7" />
        </svg>
      );
    case "mid":
      return (
        <svg {...base} className={className}>
          <path d="M4 14c2.7-5 5.3-5 8 0s5.3 5 8 0" />
        </svg>
      );
    case "low":
      return (
        <svg {...base} className={className}>
          <path d="M12 5v8M12 18.5v.5" />
        </svg>
      );
    case "few":
      return (
        <svg {...base} className={className}>
          <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3.4} />
        </svg>
      );
    default:
      return (
        <svg {...base} className={className}>
          <path d="M7 12h10" />
        </svg>
      );
  }
}

export function BackIcon({ className = "size-5" }: P) {
  return (
    <svg {...base} className={className}>
      <path d="m14.5 6-6 6 6 6" />
    </svg>
  );
}

/** Three rising bars: the link to My Progress in the home top bar. */
export function ProgressIcon({ className = "size-5" }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M5 20v-6M12 20V9M19 20V4" />
    </svg>
  );
}

"use client";

import type { Direction, LiveSnapshot, RangeStatus, VolumeStatus } from "@/lib/audio/liveDirection";
import type { Bilingual } from "@/lib/intonation/types";

type Tone = "neutral" | "good" | "warn";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-line bg-card text-muted",
  good: "border-accent bg-accent-soft text-accent",
  warn: "border-warn bg-warn-soft text-warn",
};

const DIRECTION: Record<Direction, { icon: string; label: Bilingual }> = {
  rising: { icon: "↗", label: { en: "Rising", th: "เสียงขึ้น" } },
  falling: { icon: "↘", label: { en: "Falling", th: "เสียงลง" } },
  flat: { icon: "→", label: { en: "Flat", th: "เสียงเสมอ" } },
  none: { icon: "…", label: { en: "Listening", th: "กำลังฟัง" } },
};

const RANGE: Record<RangeStatus, { icon: string; tone: Tone; label: Bilingual }> = {
  measuring: { icon: "↕", tone: "neutral", label: { en: "Pitch range: measuring", th: "ช่วงเสียง: กำลังวัด" } },
  ok: { icon: "✓", tone: "good", label: { en: "Good pitch range", th: "ช่วงเสียงกว้างดี" } },
  narrow: {
    icon: "⚠",
    tone: "warn",
    label: { en: "Too flat: go higher and lower", th: "เสียงเรียบไป ลองให้สูงต่ำมากขึ้น" },
  },
};

const VOLUME: Record<VolumeStatus, { icon: string; tone: Tone; label: Bilingual }> = {
  waiting: { icon: "🔈", tone: "neutral", label: { en: "Volume: listening", th: "ความดัง: กำลังฟัง" } },
  ok: { icon: "✓", tone: "good", label: { en: "Volume is good", th: "ความดังพอดี" } },
  quiet: { icon: "⚠", tone: "warn", label: { en: "Too quiet: speak up", th: "เบาไป พูดให้ดังขึ้น" } },
  clipping: { icon: "⚠", tone: "warn", label: { en: "Too loud: move back", th: "ดังเกินไป ถอยไมค์ออกหน่อย" } },
};

function Chip({
  icon,
  label,
  tone,
  children,
}: {
  icon: string;
  label: Bilingual;
  tone: Tone;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 basis-[9.5rem] items-start gap-2 rounded-xl border-2 px-3 py-2 text-sm font-bold ${TONE_CLASS[tone]}`}
    >
      <span aria-hidden="true" className="text-xl leading-none">
        {icon}
      </span>
      <span className="min-w-0 flex-1 leading-snug">
        <span className="block">{label.en}</span>
        <span className="thai block text-xs font-semibold">{label.th}</span>
        {children}
      </span>
    </div>
  );
}

/** Three live chips (direction, pitch range, volume). Every chip has an icon and text, never colour alone. */
export function LiveChips({ snapshot }: { snapshot: LiveSnapshot }) {
  const dir = DIRECTION[snapshot.direction];
  const range = RANGE[snapshot.range.status];
  const vol = VOLUME[snapshot.volume];
  const st = snapshot.range.semitones;

  return (
    <div className="flex flex-wrap gap-2" aria-label="Live coaching">
      <Chip icon={dir.icon} label={dir.label} tone={snapshot.direction === "none" ? "neutral" : "good"} />
      <Chip icon={range.icon} label={range.label} tone={range.tone}>
        <span className="mt-1 flex items-center gap-2">
          <span
            role="meter"
            aria-label="Pitch range in semitones"
            aria-valuemin={0}
            aria-valuemax={8}
            aria-valuenow={st === null ? 0 : Math.round(st * 10) / 10}
            className="h-2 flex-1 overflow-hidden rounded-full bg-line"
          >
            <span
              className={`block h-full rounded-full ${snapshot.range.status === "narrow" ? "bg-warn" : "bg-accent"}`}
              style={{ width: `${Math.round(snapshot.range.fill * 100)}%` }}
            />
          </span>
          <span className="w-12 text-right text-xs font-black tabular-nums">{st === null ? "–" : `${st.toFixed(1)} st`}</span>
        </span>
      </Chip>
      <Chip icon={vol.icon} label={vol.label} tone={vol.tone} />
    </div>
  );
}

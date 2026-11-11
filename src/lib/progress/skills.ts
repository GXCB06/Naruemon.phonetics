// Numbers behind the Progress charts: a skills radar and the week's practice bars. Pure: no DOM, no React.

import type { Bilingual } from "../intonation/types.ts";
import { MIN_ATTEMPTS, parseSkillKey, type MasteryMap } from "../mastery/mastery.ts";
import type { AttemptPoint, IpaProgress } from "./view.ts";

export type RadarId = "falling" | "rising" | "nonfinal" | "tags" | "drawing" | "speaking" | "listening" | "ipa";

export interface RadarAxis {
  id: RadarId;
  label: Bilingual;
  /** 0–100, or null while there is not enough data yet (the chart shows an empty spoke, not a zero). */
  value: number | null;
  /** How many counted attempts the value rests on. */
  n: number;
}

/** The radar's spokes, in drawing order (clockwise from the top). Tune first, then how you practise, then sounds. */
export const RADAR_AXES: readonly { id: RadarId; label: Bilingual }[] = [
  { id: "falling", label: { en: "Falling", th: "เสียงตก" } },
  { id: "rising", label: { en: "Rising", th: "เสียงขึ้น" } },
  { id: "nonfinal", label: { en: "Not final", th: "ยังไม่จบ" } },
  { id: "tags", label: { en: "Tags", th: "Tag" } },
  { id: "drawing", label: { en: "Drawing", th: "วาด" } },
  { id: "speaking", label: { en: "Speaking", th: "พูด" } },
  { id: "listening", label: { en: "Listening", th: "ฟัง" } },
  { id: "ipa", label: { en: "IPA", th: "IPA" } },
];

const PATTERN_AXIS: Record<string, RadarId> = { "2-3-1": "falling", "2-3": "rising", "2-3-2": "nonfinal", "3-1": "tags" };
const MODALITY_AXIS: Record<string, RadarId> = { draw: "drawing", speak: "speaking", listen: "listening" };

/**
 * One value per spoke. A tune spoke (falling, rising, ...) is the attempt-weighted mean of every skill and modality learnt for
 * that pattern; a "how" spoke (drawing, speaking, listening) the same over every pattern; IPA is the share of checked words
 * that were Perfect or Good. A spoke with fewer than MIN_ATTEMPTS attempts behind it is null.
 */
export function skillRadar(mastery: MasteryMap, ipa: IpaProgress | null): RadarAxis[] {
  const sums = new Map<RadarId, { weighted: number; n: number }>();
  const add = (id: RadarId, score: number, n: number) => {
    const s = sums.get(id) ?? { weighted: 0, n: 0 };
    s.weighted += score * n;
    s.n += n;
    sums.set(id, s);
  };
  for (const [key, entry] of Object.entries(mastery)) {
    const k = parseSkillKey(key);
    if (!k || !(entry.attemptsN > 0) || !Number.isFinite(entry.score)) continue;
    const byPattern = PATTERN_AXIS[k.pattern];
    const byHow = MODALITY_AXIS[k.modality];
    if (byPattern) add(byPattern, entry.score, entry.attemptsN);
    if (byHow) add(byHow, entry.score, entry.attemptsN);
  }
  return RADAR_AXES.map(({ id, label }) => {
    if (id === "ipa") return { id, label, value: ipa && ipa.attempts >= MIN_ATTEMPTS ? clamp(ipa.rate) : null, n: ipa?.attempts ?? 0 };
    const s = sums.get(id);
    return { id, label, value: s && s.n >= MIN_ATTEMPTS ? clamp(s.weighted / s.n) : null, n: s?.n ?? 0 };
  });
}

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

/** The weakest spoke that has data (ties: the first in drawing order), or null when none has. */
export function weakestAxis(axes: readonly RadarAxis[]): RadarAxis | null {
  const withData = axes.filter((a): a is RadarAxis & { value: number } => a.value !== null);
  return withData.length ? withData.reduce((w, a) => (a.value < w.value ? a : w)) : null;
}

// ---------------------------------------------------------------------------------------------------------------
// The week

export interface WeekDay {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** Counted attempts that day (every kind: drawing, speaking, listening). */
  count: number;
  isToday: boolean;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The last 7 local days ending today (oldest first) with how many practice attempts each had. */
export function weekActivity(points: readonly AttemptPoint[], now: Date): WeekDay[] {
  const days: WeekDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push({ day: dayKey(d), weekday: d.getDay(), count: 0, isToday: i === 0 });
  }
  const byDay = new Map(days.map((d) => [d.day, d]));
  for (const p of points) {
    const t = Date.parse(p.at);
    if (!Number.isFinite(t)) continue;
    const d = byDay.get(dayKey(new Date(t)));
    if (d) d.count += 1;
  }
  return days;
}

export interface WeekSummary {
  total: number;
  /** Days with at least one attempt. */
  activeDays: number;
  /** The busiest day's count (never 0, so bars can divide by it). */
  max: number;
}

export function weekSummary(days: readonly WeekDay[]): WeekSummary {
  const total = days.reduce((n, d) => n + d.count, 0);
  return { total, activeDays: days.filter((d) => d.count > 0).length, max: Math.max(1, ...days.map((d) => d.count)) };
}

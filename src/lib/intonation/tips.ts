import type { AnalysisResult, Bilingual, Check, CheckId } from "./types.ts";

/** Most important first. A learner fixes one thing at a time, so we only surface the top one. */
export const TIP_PRIORITY: CheckId[] = ["ending", "peakPlacement", "singlePeak", "range", "start", "break"];

export type TopTip =
  /** `groupIndex` is null for sentence-level checks (e.g. the pause between thought groups). */
  | { kind: "tip"; groupIndex: number | null; check: Check }
  | { kind: "praise"; message: Bilingual };

export const PRAISE: Bilingual = {
  en: "Great! Nothing to fix. Try the next sentence.",
  th: "เยี่ยมมาก! ไม่มีอะไรต้องแก้ ลองประโยคต่อไปได้เลย",
};

/**
 * Pick the single most important failed/warned check.
 * Order: check priority, then fail before warn, then the earlier group (sentence-level checks last).
 * Skipped and passed checks are ignored; if nothing is left, return a short praise message.
 */
export function pickTopTip(result: AnalysisResult): TopTip {
  let best: { groupIndex: number | null; check: Check; rank: [number, number, number] } | null = null;

  const consider = (groupIndex: number | null, check: Check) => {
    if (check.status !== "fail" && check.status !== "warn") return;
    const p = TIP_PRIORITY.indexOf(check.id);
    const rank: [number, number, number] = [
      p === -1 ? TIP_PRIORITY.length : p,
      check.status === "fail" ? 0 : 1,
      groupIndex ?? Number.MAX_SAFE_INTEGER,
    ];
    if (!best || compare(rank, best.rank) < 0) best = { groupIndex, check, rank };
  };

  for (const g of result.groups) for (const c of g.checks) consider(g.groupIndex, c);
  for (const c of result.sentenceChecks) consider(null, c);

  const found = best as { groupIndex: number | null; check: Check } | null;
  return found ? { kind: "tip", groupIndex: found.groupIndex, check: found.check } : { kind: "praise", message: PRAISE };
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

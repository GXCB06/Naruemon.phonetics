// "Is this microphone good enough to grade?": when to ask for a mic check, and how to show the quality of one recording.
// Pure: no DOM (the browser side is src/components/mic/*). Nothing here records or stores audio; the saved profile is only
// the name of the microphone, when it was checked and how the check went.

import type { QualityReport } from "./quality.ts";

export const MIC_PROFILE_KEY = "myna.mic.v1";
/** A mic check older than this is offered again (rooms and devices change). */
export const MIC_CHECK_MAX_AGE_DAYS = 45;

export type CheckVerdict = "good" | "warn" | "fail";

export interface MicProfile {
  /** The microphone's name as the browser reports it ("" when it does not say). */
  label: string;
  /** When the check finished (ms since 1970). */
  checkedAt: number;
  /** Background noise measured in the check, dBFS, or null. */
  noiseDb: number | null;
  verdict: CheckVerdict;
}

/** Read the saved profile defensively: anything unexpected means "never checked". */
export function parseMicProfile(raw: string | null): MicProfile | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<MicProfile> | null;
    if (!v || typeof v !== "object") return null;
    if (typeof v.label !== "string" || typeof v.checkedAt !== "number" || !Number.isFinite(v.checkedAt)) return null;
    if (v.verdict !== "good" && v.verdict !== "warn" && v.verdict !== "fail") return null;
    const noiseDb = typeof v.noiseDb === "number" && Number.isFinite(v.noiseDb) ? v.noiseDb : null;
    return { label: v.label.slice(0, 200), checkedAt: v.checkedAt, noiseDb, verdict: v.verdict };
  } catch {
    return null;
  }
}

export type GateReason = "never" | "failed" | "changed" | "stale";

export interface GateDecision {
  need: boolean;
  reason: GateReason | null;
}

/**
 * Should Myna ask for a mic check before this recording?
 *  - never checked on this device, or the last check failed (too quiet, no sound)
 *  - the microphone in use now is a different one from the one checked (`currentLabel`, known once the mic is open)
 *  - the check is old
 * A check that only warned (a noisy room) counts as done: the learner was told, and the take itself is judged again.
 */
export function micGate(profile: MicProfile | null, currentLabel: string | null, now: number): GateDecision {
  if (!profile) return { need: true, reason: "never" };
  if (profile.verdict === "fail") return { need: true, reason: "failed" };
  if (currentLabel && profile.label && currentLabel !== profile.label) return { need: true, reason: "changed" };
  if (now - profile.checkedAt > MIC_CHECK_MAX_AGE_DAYS * 86_400_000) return { need: true, reason: "stale" };
  return { need: false, reason: null };
}

// ---------------------------------------------------------------------------------------------------------------
// One recording
// ---------------------------------------------------------------------------------------------------------------

export interface TakeChip {
  key: "volume" | "noise" | "clipping";
  level: "good" | "warn" | "fail";
  label: { en: string; th: string };
  /** Short result, e.g. "too quiet". */
  value: { en: string; th: string };
}

/** Three plain checks of one take, for the strip under a recording: volume, background noise, clipping. */
export function takeChips(q: QualityReport): TakeChip[] {
  const volume: TakeChip =
    q.speechDb < -40
      ? { key: "volume", level: "fail", label: { en: "Volume", th: "ระดับเสียง" }, value: { en: "too quiet", th: "เบาไป" } }
      : { key: "volume", level: "good", label: { en: "Volume", th: "ระดับเสียง" }, value: { en: "good", th: "ดี" } };
  const noise: TakeChip =
    q.noiseDb > -45 || q.snrDb < 15
      ? { key: "noise", level: "warn", label: { en: "Room", th: "ห้อง" }, value: { en: "noisy", th: "มีเสียงรบกวน" } }
      : { key: "noise", level: "good", label: { en: "Room", th: "ห้อง" }, value: { en: "quiet", th: "เงียบ" } };
  const clipping: TakeChip =
    q.clippedRatio > 0.001
      ? { key: "clipping", level: "warn", label: { en: "Sound", th: "เสียง" }, value: { en: "too loud", th: "ดังไป" } }
      : { key: "clipping", level: "good", label: { en: "Sound", th: "เสียง" }, value: { en: "clean", th: "ชัด" } };
  return [volume, noise, clipping];
}

/**
 * A take the pitch tracker cannot judge fairly: too quiet to hear. Such a take gets no score (CHECK stays off) so a weak
 * microphone can never cost the learner points; noise and clipping only warn, because the pitch is usually still readable.
 */
export function takeBlocksGrade(q: QualityReport): boolean {
  return q.issues.some((i) => i.level === "fail");
}

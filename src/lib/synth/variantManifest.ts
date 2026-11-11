// Which real-voice practice clips exist (public/audio/variants/manifest.json). Pure and tiny on purpose: the lesson builder
// reads it too, so it can prefer exercises whose clips all exist. See src/lib/synth/variants.ts for how the clips are made.

import type { ClipVariant } from "../learn/exercises.ts";

/** The variants made as real clips ("busy" stays a synthetic clip: it is a nuance, not a tune a learner has to hear). */
export const REAL_VARIANTS: readonly ClipVariant[] = ["falling", "rising", "flat", "finished"];

export function variantUrl(sentenceId: string, variant: ClipVariant): string {
  return `/audio/variants/${sentenceId}--${variant}.mp3`;
}
export const VARIANT_MANIFEST_URL = "/audio/variants/manifest.json";

/** Which variants exist as real clips, by sentence id. */
export interface VariantManifest {
  clips: Record<string, ClipVariant[]>;
}
export const EMPTY_VARIANTS: VariantManifest = { clips: {} };

/** Read manifest.json leniently: anything malformed counts as "no clip" (the app then plays the synthetic voice). */
export function parseVariantManifest(data: unknown): VariantManifest {
  const clips: Record<string, ClipVariant[]> = {};
  const raw = data !== null && typeof data === "object" ? (data as { clips?: unknown }).clips : undefined;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { clips };
  for (const [id, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const ok = list.filter((v): v is ClipVariant => REAL_VARIANTS.includes(v as ClipVariant));
    if (ok.length) clips[id] = [...new Set(ok)];
  }
  return { clips };
}

/** True when every variant in `needed` has a real clip for this sentence (a real voice never sits next to the synthetic one). */
export function hasRealVariants(manifest: VariantManifest, sentenceId: string, needed: readonly ClipVariant[]): boolean {
  const have = Object.hasOwn(manifest.clips, sentenceId) ? manifest.clips[sentenceId] : [];
  return needed.every((v) => have.includes(v));
}

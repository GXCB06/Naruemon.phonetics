// Digital make-up gain for a recorded take.
//
// A tablet held at arm's length, or a browser stream with the call-style auto gain switched off (which is what we want
// for pitch), can arrive 20–30 dB quieter than a close-talking mic. Pitch analysis and scoring already work on relative
// levels, but the old "too quiet" rule refused to score such a take at all. This lifts the whole take to a usable level
// without changing its shape, then a peak guard makes sure the boost can never clip. Pure: no DOM, no React.

import { speechLoudnessDb } from "./quality.ts";

/** Speech is brought up to about this loudness (90th-percentile frame). */
export const TARGET_SPEECH_DB = -20;
/** Never amplify more than this, or a silent room turns into amplified hiss. */
export const MAX_BOOST_DB = 24;
/** The boosted take may not go above this sample value (0.98 ≈ −0.2 dBFS). */
export const PEAK_CEILING = 0.98;

export interface NormalizedTake {
  /** The (possibly) amplified take. The input array is never modified; unchanged takes are returned as they are. */
  samples: Float32Array;
  /** Make-up gain applied, in dB. 0 means "already loud enough". */
  gainDb: number;
}

/**
 * Lift a take towards TARGET_SPEECH_DB. Only boosts (a loud take is left alone), caps at MAX_BOOST_DB, and reduces the
 * boost when the loudest sample would otherwise cross PEAK_CEILING. Silence stays silence.
 */
export function normalizeTake(samples: Float32Array, sampleRate: number): NormalizedTake {
  if (samples.length === 0) return { samples, gainDb: 0 };
  const speechDb = speechLoudnessDb(samples, sampleRate);
  // −100 dBFS is the "nothing but digital silence" end of the scale: don't amplify it
  if (!Number.isFinite(speechDb) || speechDb <= -100) return { samples, gainDb: 0 };

  let boostDb = Math.min(MAX_BOOST_DB, TARGET_SPEECH_DB - speechDb);
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  if (peak > 0) boostDb = Math.min(boostDb, 20 * Math.log10(PEAK_CEILING / peak));
  if (boostDb < 0.5) return { samples, gainDb: 0 };

  const gain = 10 ** (boostDb / 20);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = Math.max(-PEAK_CEILING, Math.min(PEAK_CEILING, samples[i] * gain));
  return { samples: out, gainDb: Math.round(boostDb * 10) / 10 };
}

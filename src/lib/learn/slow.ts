// The 🐢 Slow switch: one setting for every clip and every read-aloud in the app. Pure.

/** Playback speed of a recorded clip when Slow is on (1 = normal). Slower than this and the voice drags and sounds too low. */
export const SLOW_CLIP_RATE = 0.7;

/** Speech-engine rates (the device voice in Read aloud): a sentence and a single word. */
export const SPEECH_RATES = { sentence: { normal: 0.95, slow: 0.65 }, word: { normal: 0.8, slow: 0.6 } } as const;

export function clipRate(slow: boolean): number {
  return slow ? SLOW_CLIP_RATE : 1;
}

export function speechRate(kind: "sentence" | "word", slow: boolean): number {
  return SPEECH_RATES[kind][slow ? "slow" : "normal"];
}

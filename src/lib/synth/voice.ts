import { SEMITONES_PER_LEVEL } from "../intonation/contour.ts";
import type { Sentence } from "../intonation/types.ts";

// A tiny "robot voice" synthesiser: a buzzy harmonic source that follows a sentence's target pitch levels,
// one burst per syllable, with consonant gaps and a pause between thought groups.
// It is NOT speech — it exists to test the pitch tracker and rule engine end to end, and to give the
// lab page demo audio before Azure TTS is wired up (Phase 0b).

export interface SynthOptions {
  sampleRate?: number;
  /** Speaker's level-2 pitch in Hz (≈210 female, ≈120 male). */
  baseHz?: number;
  syllableSec?: number;
  stressedSec?: number;
  gapSec?: number;
  pauseSec?: number;
  /** Change the target levels, e.g. to simulate learner errors. */
  transform?: (levels: number[], info: { group: number; index: number; isLastInGroup: boolean; stressed: boolean }) => number[];
  /** Fill thought-group pauses with voiced sound (simulates no pause at a comma). */
  noPause?: boolean;
  seed?: number;
}

export function synthesizeSentence(sentence: Sentence, options: SynthOptions = {}): { samples: Float32Array; sampleRate: number } {
  const o = {
    sampleRate: 48000,
    baseHz: 200,
    syllableSec: 0.2,
    stressedSec: 0.27,
    gapSec: 0.04,
    pauseSec: 0.3,
    seed: 1,
    ...options,
  };
  let seed = o.seed;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const sr = o.sampleRate;
  const out: number[] = [];
  const lead = Math.round(0.25 * sr);
  for (let i = 0; i < lead; i++) out.push(0);

  let phase = 0;
  const levelToHz = (l: number) => o.baseHz * Math.pow(2, ((l - 2) * SEMITONES_PER_LEVEL) / 12);

  sentence.groups.forEach((g, gi) => {
    const sylls = g.words.flatMap((w) => w.syllables);
    sylls.forEach((s, si) => {
      const info = { group: gi, index: si, isLastInGroup: si === sylls.length - 1, stressed: !!s.stressed };
      const levels = o.transform ? o.transform(s.levels, info) : s.levels;
      const dur = s.stressed ? o.stressedSec : o.syllableSec;
      const n = Math.round(dur * sr);
      const amp = s.stressed ? 0.5 : 0.35;
      for (let i = 0; i < n; i++) {
        const x = i / n;
        let level: number;
        if (levels.length === 1) level = levels[0];
        else {
          const f = Math.min(1, Math.max(0, (x - 0.15) / 0.7));
          level = levels[0] + f * (levels[levels.length - 1] - levels[0]);
        }
        const hz = levelToHz(level) * (1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * (out.length / sr)));
        phase += (2 * Math.PI * hz) / sr;
        let v = 0;
        for (let k = 1; k * hz < 3800; k++) v += Math.sin(k * phase) / Math.pow(k, 1.1);
        const attack = Math.min(1, i / (0.02 * sr));
        const release = Math.min(1, (n - i) / (0.03 * sr));
        out.push(0.3 * amp * v * attack * release + 0.0015 * rnd());
      }
      // consonant gap (quiet noise), longer pause between thought groups
      const isGroupEnd = si === sylls.length - 1 && gi < sentence.groups.length - 1;
      if (isGroupEnd && o.noPause) {
        // keep voicing through the comma at level 2
        const m = Math.round(o.pauseSec * 0.6 * sr);
        const hz = levelToHz(2);
        for (let i = 0; i < m; i++) {
          phase += (2 * Math.PI * hz) / sr;
          let v = 0;
          for (let k = 1; k * hz < 3800; k++) v += Math.sin(k * phase) / Math.pow(k, 1.1);
          out.push(0.06 * v);
        }
      } else {
        const gap = Math.round((isGroupEnd ? o.pauseSec : o.gapSec) * sr);
        for (let i = 0; i < gap; i++) out.push(0.003 * rnd());
      }
    });
  });
  for (let i = 0; i < lead; i++) out.push(0.0015 * rnd());
  return { samples: Float32Array.from(out), sampleRate: sr };
}

/** Typical learner errors, as transforms for synthesizeSentence. */
export const ERROR_STYLES = {
  /** Monotone: compress every level towards 2. */
  flat: (levels: number[]) => levels.map((l) => 2 + (l - 2) * 0.2),
  /** Reverse the final direction of every thought group (falls become rises and vice versa). */
  wrongEnding: (levels: number[], info: { isLastInGroup: boolean }) => {
    if (!info.isLastInGroup) return levels;
    const last = levels[levels.length - 1];
    const first = levels[0];
    if (levels.length === 1) return last <= 1.5 ? [2, 3.2] : [first, 1];
    return last < first ? [first, Math.min(4, first + 0.6)] : [first, 1];
  },
  /** Give every stressed syllable its own rise ("a tone on every word"). */
  everyWordTone: (levels: number[], info: { stressed: boolean; isLastInGroup: boolean }) =>
    info.stressed && !info.isLastInGroup ? [2, 3] : levels,
};

// Recording-quality checks: is the take loud enough, not clipped, and recorded somewhere quiet?

export interface QualityReport {
  peak: number;
  /** Share of samples at or near full scale. */
  clippedRatio: number;
  /** Loudness of speech frames, dBFS. */
  speechDb: number;
  /** Background noise (quietest 10% of frames), dBFS. */
  noiseDb: number;
  /** speechDb - noiseDb */
  snrDb: number;
  issues: { level: "warn" | "fail"; en: string; th: string }[];
}

export function assessQuality(samples: Float32Array, sampleRate: number): QualityReport {
  const frame = Math.round(0.02 * sampleRate);
  const dbs: number[] = [];
  let peak = 0;
  let clipped = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
    if (a >= 0.99) clipped++;
  }
  for (let s = 0; s + frame <= samples.length; s += frame) {
    let sum = 0;
    for (let i = s; i < s + frame; i++) sum += samples[i] * samples[i];
    dbs.push(10 * Math.log10(sum / frame + 1e-12));
  }
  const sorted = dbs.slice().sort((a, b) => a - b);
  const pick = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? -120;
  const noiseDb = pick(0.1);
  const speechDb = pick(0.9);
  const snrDb = speechDb - noiseDb;
  const clippedRatio = samples.length ? clipped / samples.length : 0;

  const issues: QualityReport["issues"] = [];
  if (clippedRatio > 0.001)
    issues.push({ level: "warn", en: "Too loud — the sound is clipping. Move the mic a little further away.", th: "เสียงดังเกินไปจนแตก ให้ถอยไมค์ออกไปอีกนิด" });
  if (speechDb < -40)
    issues.push({ level: "fail", en: "Too quiet. Speak up or move closer to the mic.", th: "เสียงเบาเกินไป พูดให้ดังขึ้นหรือเข้าใกล้ไมค์" });
  if (noiseDb > -45)
    issues.push({ level: "warn", en: "Noisy room. Find a quieter place for better results.", th: "มีเสียงรบกวนมาก ลองหาที่เงียบกว่านี้" });
  if (snrDb < 15)
    issues.push({ level: "warn", en: "Your voice is close to the background noise level.", th: "เสียงพูดใกล้เคียงกับเสียงรบกวนรอบข้าง" });
  return { peak, clippedRatio, speechDb, noiseDb, snrDb, issues };
}

/** Trim leading/trailing silence (with padding) using a simple energy threshold. */
export function trimSilence(samples: Float32Array, sampleRate: number, padSec = 0.2): Float32Array {
  const frame = Math.round(0.02 * sampleRate);
  const energies: number[] = [];
  for (let s = 0; s + frame <= samples.length; s += frame) {
    let sum = 0;
    for (let i = s; i < s + frame; i++) sum += samples[i] * samples[i];
    energies.push(sum / frame);
  }
  if (!energies.length) return samples;
  const max = Math.max(...energies);
  const thr = max * 0.001; // -30 dB below the loudest frame
  const first = energies.findIndex((e) => e > thr);
  let last = energies.length - 1;
  while (last > 0 && energies[last] <= thr) last--;
  if (first < 0) return samples;
  const pad = Math.round(padSec * sampleRate);
  const a = Math.max(0, first * frame - pad);
  const b = Math.min(samples.length, (last + 1) * frame + pad);
  return samples.slice(a, b);
}

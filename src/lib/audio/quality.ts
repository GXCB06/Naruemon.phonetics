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

// ---------------------------------------------------------------------------------------------------------------
// Mic check helpers (pure): live level meter, room noise floor, and "is this a good mic?" warnings.
// ---------------------------------------------------------------------------------------------------------------

export interface MicMessage {
  level: "ok" | "warn" | "fail";
  en: string;
  th: string;
}

/** RMS loudness of a block of samples, dBFS (silence → -120). */
export function rmsDb(samples: Float32Array): number {
  if (!samples.length) return -120;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.max(-120, 10 * Math.log10(sum / samples.length + 1e-12));
}

/** Loudness of each 20 ms frame, dBFS. */
export function frameDbs(samples: Float32Array, sampleRate: number, frameSec = 0.02): number[] {
  const frame = Math.max(1, Math.round(frameSec * sampleRate));
  const out: number[] = [];
  for (let s = 0; s + frame <= samples.length; s += frame) out.push(rmsDb(samples.subarray(s, s + frame)));
  return out;
}

/** Meter position 0..1 for a dBFS value: -60 dB (and below) is empty, 0 dB is full. */
export function meterLevel(db: number, floorDb = -60): number {
  if (!Number.isFinite(db)) return 0;
  return Math.min(1, Math.max(0, (db - floorDb) / -floorDb));
}

/**
 * Smooth a meter like a VU needle: jump up at once, fall back slowly. `dt` is the time since the last value (s).
 * Returns the new displayed dB.
 */
export function smoothMeterDb(prevDb: number, nextDb: number, dt: number, releaseDbPerSec = 30): number {
  if (nextDb >= prevDb) return nextDb;
  return Math.max(nextDb, prevDb - releaseDbPerSec * Math.max(0, dt));
}

/** Room noise floor below this (dBFS) counts as quiet; at or above NOISY it is too noisy for good pitch tracking. */
export const NOISE_FLOOR = { quietBelowDb: -55, noisyFromDb: -45 } as const;

export interface NoiseFloorReport {
  /** Median frame loudness while the learner stays silent, dBFS. */
  noiseDb: number;
  verdict: "quiet" | "ok" | "noisy";
  message: MicMessage;
}

/**
 * Judge the room from ~2 s of "please stay quiet" audio. The median frame is used so one cough or a tap on the screen
 * doesn't decide the result.
 */
export function assessNoiseFloor(samples: Float32Array, sampleRate: number): NoiseFloorReport {
  const dbs = frameDbs(samples, sampleRate).sort((a, b) => a - b);
  const noiseDb = dbs.length ? dbs[Math.floor(dbs.length / 2)] : -120;
  if (noiseDb < NOISE_FLOOR.quietBelowDb)
    return {
      noiseDb,
      verdict: "quiet",
      message: { level: "ok", en: "Quiet room. Great for practice!", th: "ห้องเงียบดี เหมาะกับการฝึกมาก!" },
    };
  if (noiseDb < NOISE_FLOOR.noisyFromDb)
    return {
      noiseDb,
      verdict: "ok",
      message: {
        level: "ok",
        en: "A little background noise, but it's OK.",
        th: "มีเสียงรบกวนเล็กน้อย แต่ใช้ได้",
      },
    };
  return {
    noiseDb,
    verdict: "noisy",
    message: {
      level: "warn",
      en: "It's noisy here. Move somewhere quieter, or hold the device closer when you speak.",
      th: "ที่นี่เสียงดัง ลองย้ายไปที่เงียบกว่านี้ หรือถือเครื่องให้ใกล้ปากขึ้นตอนพูด",
    },
  };
}

/** Device label words that usually mean a Bluetooth headset (whose mic drops to low-quality "call" audio). */
const BLUETOOTH_RE = /bluetooth|airpods|\bbuds?\d*\b|headset|hands-?free|\bbt\b|beats|jabra|bose|\bwh-|\bwf-|soundcore|hfp/i;

export function looksLikeBluetooth(label: string): boolean {
  return BLUETOOTH_RE.test(label);
}

const STANDARD_RATES = [44100, 48000, 88200, 96000];

/**
 * Warnings about the input device itself. `contextRate` is the AudioContext rate; `trackRate` is what the microphone
 * track reports (Bluetooth headsets often report 8 or 16 kHz even when the context runs at 48 kHz).
 */
export function micDeviceWarnings(info: {
  label: string;
  contextRate: number;
  trackRate?: number | null;
  rawAudio: boolean;
}): MicMessage[] {
  const out: MicMessage[] = [];
  const rate = info.trackRate && info.trackRate > 0 ? Math.min(info.trackRate, info.contextRate) : info.contextRate;
  if (looksLikeBluetooth(info.label))
    out.push({
      level: "warn",
      en: "This looks like a Bluetooth headset. Its mic sounds like a phone call and can hide your pitch. Use the built-in mic or a wired one if you can.",
      th: "ดูเหมือนเป็นหูฟังบลูทูธ ไมค์ของมันเสียงเหมือนคุยโทรศัพท์และอาจทำให้จับระดับเสียงได้ไม่ดี ถ้าได้ ให้ใช้ไมค์ในเครื่องหรือไมค์แบบมีสาย",
    });
  if (rate < 32000)
    out.push({
      level: "warn",
      en: `The mic runs at only ${Math.round(rate / 1000)} kHz (narrowband). Results may be less accurate.`,
      th: `ไมค์ทำงานที่ ${Math.round(rate / 1000)} kHz เท่านั้น (คุณภาพต่ำ) ผลอาจแม่นยำน้อยลง`,
    });
  else if (!STANDARD_RATES.includes(Math.round(rate)))
    out.push({
      level: "warn",
      en: `Unusual sample rate (${rate} Hz). If results look odd, try another mic.`,
      th: `อัตราสุ่มเสียงแปลก (${rate} Hz) ถ้าผลดูแปลก ลองใช้ไมค์อื่น`,
    });
  if (!info.rawAudio)
    out.push({
      level: "warn",
      en: "The browser kept its call-style sound processing on. Pitch results may be a little less accurate.",
      th: "เบราว์เซอร์ยังเปิดการปรับแต่งเสียงแบบโทรศัพท์อยู่ ผลระดับเสียงอาจแม่นยำน้อยลงเล็กน้อย",
    });
  return out;
}

/**
 * One-line verdict for the 3-second test take, built on assessQuality. When the room noise was measured separately
 * (`roomNoiseDb`, from assessNoiseFloor), the take's own noise guesses are replaced by that measurement: a learner who
 * talks for the whole 3 seconds would otherwise look like a "noisy room".
 */
export function testTakeVerdict(
  samples: Float32Array,
  sampleRate: number,
  roomNoiseDb?: number,
): { report: QualityReport; summary: MicMessage } {
  let report = assessQuality(samples, sampleRate);
  if (roomNoiseDb !== undefined && Number.isFinite(roomNoiseDb)) {
    const snrDb = report.speechDb - roomNoiseDb;
    const issues = report.issues.filter((i) => !i.en.startsWith("Noisy room") && !i.en.startsWith("Your voice is close"));
    if (snrDb < 15 && report.speechDb >= -40)
      issues.push({
        level: "warn",
        en: "Your voice is close to the background noise level.",
        th: "เสียงพูดใกล้เคียงกับเสียงรบกวนรอบข้าง",
      });
    report = { ...report, noiseDb: roomNoiseDb, snrDb, issues };
  }
  const fail = report.issues.find((i) => i.level === "fail");
  const warn = report.issues.find((i) => i.level === "warn");
  const summary: MicMessage = fail
    ? { level: "fail", en: fail.en, th: fail.th }
    : warn
      ? { level: "warn", en: warn.en, th: warn.th }
      : { level: "ok", en: "Your voice came through loud and clear!", th: "ได้ยินเสียงคุณชัดเจนดีมาก!" };
  return { report, summary };
}

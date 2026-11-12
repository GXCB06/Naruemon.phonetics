import {
  fillGaps,
  layoutSentence,
  mean,
  movingAverage,
  percentile,
  resample,
  SEMITONES_PER_LEVEL,
  sliceContour,
  targetContour,
} from "./contour.ts";
import { dtwMeanCost } from "./dtw.ts";
import type {
  AnalysisResult,
  Check,
  CheckStatus,
  Contour,
  GroupFeatures,
  GroupResult,
  Layout,
  Modality,
  PatternId,
  Sentence,
  SyllableSlot,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Tunable thresholds (in pitch levels; 1 level ≈ 4 semitones). Calibrate in Phase 0a/0b.
// ---------------------------------------------------------------------------
export const THRESHOLDS = {
  /** Smallest bump that counts as its own peak. */
  peakProminence: 0.5,
  /** Start level must be within this of the target start. */
  startPass: 0.5,
  startWarn: 0.85,
  /** Range (p95 - p5) needed to not sound flat. 0.8 level ≈ 3.2 semitones. */
  rangePass: 0.8,
  rangeWarn: 0.45,
  /** How far a falling pattern must drop from its peak by the end. */
  fallPass: 0.9,
  fallWarn: 0.5,
  /** Shortest pause (seconds) that counts as a thought-group break in speech. */
  minBreakSec: 0.12,
};

/** Highest possible overall score when a key check fails. */
export const SCORE_CAP = { wrongEnding: 50, flat: 55 };

export interface AnalyzeOptions {
  modality: Modality;
  /**
   * true when the contour's time axis already matches the sentence layout (drawings, or voice
   * aligned with Azure syllable timestamps). false for raw voice in Phase 0a.
   */
  timingKnown: boolean;
  /** Real duration of the contour in seconds (voice only; used to measure pauses). */
  durationSec?: number;
}

/** Grade a learner contour (voice or drawing) against a sentence's target pattern. */
export function analyze(sentence: Sentence, learner: Contour, opts: AnalyzeOptions): AnalysisResult {
  const layout = layoutSentence(sentence);
  const target = targetContour(layout);
  const sentenceChecks: Check[] = [];

  // 1. Split the learner contour into thought groups and map each onto its target span.
  let segments: { t: number; v: number | null }[][];
  if (opts.timingKnown) {
    segments = layout.groupSpans.map((span) => sliceContour(learner, span.start, span.end));
  } else {
    const split = splitByPauses(learner, sentence.groups.length, opts.durationSec ?? 0);
    segments = split.segments.map((seg, gi) => retime(seg, layout.groupSpans[gi]));
    if (sentence.groups.length > 1) {
      sentenceChecks.push(
        split.foundBreaks
          ? check("break", "pass", "Good pause between the thought groups.", "เว้นจังหวะระหว่างกลุ่มคำได้ดี")
          : check(
              "break",
              "warn",
              "Pause briefly at the comma so each thought group has its own tune.",
              "หยุดเล็กน้อยตรงเครื่องหมายจุลภาค ให้แต่ละกลุ่มคำมีทำนองของตัวเอง",
            ),
      );
    }
  }

  // 2. Grade each thought group.
  const groups: GroupResult[] = sentence.groups.map((g, gi) => {
    const span = layout.groupSpans[gi];
    const tgtPts = fillGaps(sliceContour(target, span.start, span.end));
    const lrnPts = fillGaps(segments[gi] ?? []);
    const tgtF = groupFeatures(tgtPts);
    const slots = layout.slots.filter((s) => s.groupIndex === gi);
    const nucleus = slots.find((s) => s.isNucleus) as SyllableSlot;

    if (lrnPts.length < 5) {
      return {
        groupIndex: gi,
        pattern: g.pattern,
        shapeScore: 0,
        features: emptyFeatures(),
        checks: [
          check(
            "range",
            "fail",
            opts.modality === "draw"
              ? "Draw the line across this whole part of the sentence."
              : "I couldn't hear a clear pitch here. Speak a bit louder, in a quiet place.",
            opts.modality === "draw"
              ? "ลากเส้นให้ครอบคลุมส่วนนี้ของประโยคทั้งหมด"
              : "ยังจับระดับเสียงส่วนนี้ไม่ได้ ลองพูดดังขึ้นอีกนิดในที่เงียบ",
          ),
        ],
      };
    }

    const f = groupFeatures(lrnPts);
    const checks: Check[] = [
      checkStart(g.pattern, f, tgtF),
      checkSinglePeak(g.pattern, f),
      opts.timingKnown
        ? checkPeakPlacement(g.pattern, f, nucleus, slots)
        : check(
            "peakPlacement",
            "skip",
            "Peak position needs syllable timing (comes with Azure in Phase 0b).",
            "ตำแหน่งจุดสูงสุดต้องใช้เวลาของแต่ละพยางค์ (เพิ่มใน Phase 0b)",
          ),
      checkEnding(g.pattern, f),
      checkRange(g.pattern, f),
    ];
    const cost = dtwMeanCost(
      resample(lrnPts.map((p) => p.v), 60),
      resample(tgtPts.map((p) => p.v), 60),
      0.2,
    );
    const shapeScore = Math.round(100 * clamp(1 - cost / 1.2, 0, 1));
    return { groupIndex: gi, pattern: g.pattern, checks, shapeScore, features: f };
  });

  // 3. Overall score: 60% rule checks (the ending counts double: it decides the meaning), 40% shape.
  //    A wrong ending or a flat voice caps the score, so a "nice shape" can't hide a wrong pattern.
  const allChecks = [...groups.flatMap((g) => g.checks), ...sentenceChecks].filter((c) => c.status !== "skip");
  const weight = (c: Check) => (c.id === "ending" ? 2 : 1);
  const value = (c: Check) => (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0);
  const totalW = allChecks.reduce((n, c) => n + weight(c), 0);
  const checkScore = totalW ? allChecks.reduce((n, c) => n + weight(c) * value(c), 0) / totalW : 0;
  const shape = mean(groups.map((g) => g.shapeScore)) / 100;
  let overall = Math.round(100 * (0.6 * checkScore + 0.4 * shape));
  if (allChecks.some((c) => c.id === "ending" && c.status === "fail")) overall = Math.min(overall, SCORE_CAP.wrongEnding);
  if (allChecks.some((c) => c.id === "range" && c.status === "fail")) overall = Math.min(overall, SCORE_CAP.flat);

  const aligned: Contour = segments.flat();
  return {
    modality: opts.modality,
    groups,
    sentenceChecks,
    overall,
    syllableLevels: opts.timingKnown ? syllableLevels(layout, aligned) : null,
    aligned,
  };
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

export function groupFeatures(pts: { t: number; v: number }[]): GroupFeatures {
  if (pts.length === 0) return emptyFeatures();
  const raw = pts.map((p) => p.v);
  const v = movingAverage(raw, Math.max(1, Math.round(pts.length * 0.04)));
  const n = v.length;
  const head = Math.max(1, Math.round(n * 0.12));
  // Short tail window: in a long thought group the final glide only covers the last few percent.
  const tail = Math.max(2, Math.round(n * 0.05));
  // Start/end use the unsmoothed values: smoothing near the edges blurs a final fall.
  const startLevel = mean(raw.slice(0, head));
  const endLevel = mean(raw.slice(n - tail));
  // How low the voice got at the close: a learner who drops to low and then trails off (creaky or very quiet last frames, a
  // final breath of pitch that lifts a little) has still fallen, so the falling check looks at the low part of the closing stretch.
  const closing = raw.slice(n - Math.max(4, Math.round(n * 0.12))).sort((a, b) => a - b);
  const endLow = Math.min(endLevel, mean(closing.slice(0, Math.max(2, Math.ceil(closing.length / 2)))));
  const before = mean(v.slice(Math.floor(n * 0.7), Math.max(Math.floor(n * 0.7) + 1, Math.floor(n * 0.85))));
  let maxI = 0;
  let minI = 0;
  for (let i = 1; i < n; i++) {
    if (v[i] > v[maxI]) maxI = i;
    if (v[i] < v[minI]) minI = i;
  }
  return {
    startLevel,
    endLevel,
    endLow,
    maxLevel: v[maxI],
    minLevel: v[minI],
    range: percentile(v, 0.95) - percentile(v, 0.05),
    endSlope: endLevel - before,
    interiorPeaks: countInteriorPeaks(v, THRESHOLDS.peakProminence),
    risePointT: risePoint(pts, v, maxI, startLevel),
    maxT: pts[maxI].t,
  };
}

function countInteriorPeaks(v: number[], minProm: number): number {
  const n = v.length;
  const edge = Math.max(1, Math.round(n * 0.05));
  let count = 0;
  for (let i = edge; i < n - edge; i++) {
    if (!(v[i] > v[i - 1] && v[i] >= v[i + 1])) continue;
    let leftMin = v[i];
    for (let j = i - 1; j >= 0 && v[j] <= v[i]; j--) leftMin = Math.min(leftMin, v[j]);
    let rightMin = v[i];
    for (let j = i + 1; j < n && v[j] <= v[i]; j++) rightMin = Math.min(rightMin, v[j]);
    const reachedEndRight = (() => {
      for (let j = i + 1; j < n; j++) if (v[j] > v[i]) return false;
      return true;
    })();
    // A peak whose right side never drops (rise to the end) is a boundary rise, not an interior peak.
    if (reachedEndRight && v[i] - rightMin < minProm) continue;
    if (v[i] - Math.max(leftMin, rightMin) >= minProm) count++;
  }
  return count;
}

/** Halfway point of the rise that leads to the main peak, searched backwards from the peak. */
function risePoint(pts: { t: number; v: number }[], v: number[], maxI: number, startLevel: number): number | null {
  const height = v[maxI] - startLevel;
  if (height < THRESHOLDS.peakProminence) return null;
  const half = startLevel + height / 2;
  for (let i = maxI; i > 0; i--) {
    if (v[i - 1] < half && v[i] >= half) {
      const f = (half - v[i - 1]) / (v[i] - v[i - 1]);
      return pts[i - 1].t + f * (pts[i].t - pts[i - 1].t);
    }
  }
  return pts[0].t;
}

function emptyFeatures(): GroupFeatures {
  return {
    startLevel: NaN,
    endLevel: NaN,
    endLow: NaN,
    maxLevel: NaN,
    minLevel: NaN,
    range: 0,
    endSlope: 0,
    interiorPeaks: 0,
    risePointT: null,
    maxT: 0,
  };
}

// ---------------------------------------------------------------------------
// Checks (each returns a short bilingual message)
// ---------------------------------------------------------------------------

function check(id: Check["id"], status: CheckStatus, en: string, th: string): Check {
  return { id, status, message: { en, th } };
}

function checkStart(pattern: PatternId, f: GroupFeatures, tgt: GroupFeatures): Check {
  const diff = f.startLevel - tgt.startLevel;
  const want = pattern === "3-1" ? "high (level 3)" : "your normal mid voice (level 2)";
  const wantTh = pattern === "3-1" ? "เสียงสูง (ระดับ 3)" : "เสียงกลางปกติ (ระดับ 2)";
  if (Math.abs(diff) <= THRESHOLDS.startPass) {
    return check("start", "pass", `Good start at ${want}.`, `เริ่มต้นได้ดีที่${wantTh}`);
  }
  const dir = diff > 0 ? "too high" : "too low";
  const dirTh = diff > 0 ? "สูงเกินไป" : "ต่ำเกินไป";
  return check(
    "start",
    Math.abs(diff) <= THRESHOLDS.startWarn ? "warn" : "fail",
    `You started ${dir}. Begin at ${want}.`,
    `เริ่มต้น${dirTh} ให้เริ่มที่${wantTh}`,
  );
}

function checkSinglePeak(pattern: PatternId, f: GroupFeatures): Check {
  const allowed = pattern === "3-1" ? 0 : 1;
  if (f.interiorPeaks <= allowed) {
    return check(
      "singlePeak",
      "pass",
      pattern === "3-1" ? "Smooth fall with no extra bumps." : "One clear peak in this thought group.",
      pattern === "3-1" ? "เสียงตกลงอย่างราบรื่น ไม่มีจุดขึ้นเกิน" : "มีจุดสูงสุดเพียงจุดเดียวในกลุ่มคำนี้",
    );
  }
  return check(
    "singlePeak",
    f.interiorPeaks - allowed === 1 ? "warn" : "fail",
    `I found ${f.interiorPeaks} rises. Use only ONE peak per thought group — don't give every word its own tone.`,
    `พบจุดขึ้น ${f.interiorPeaks} จุด ให้มีจุดสูงสุดเพียงจุดเดียวต่อกลุ่มคำ อย่าใส่วรรณยุกต์ให้ทุกคำ`,
  );
}

function checkPeakPlacement(
  pattern: PatternId,
  f: GroupFeatures,
  nucleus: SyllableSlot,
  slots: SyllableSlot[],
): Check {
  const name = nucleus.syllable.text.toUpperCase();
  const w = nucleus.end - nucleus.start;
  const t = pattern === "3-1" ? f.maxT : f.risePointT;
  if (t === null) {
    return check(
      "peakPlacement",
      "fail",
      `No clear rise found. Rise up to level 3 on ${name}.`,
      `ไม่พบเสียงขึ้นที่ชัดเจน ให้ขึ้นไประดับ 3 ที่ ${name}`,
    );
  }
  if (t >= nucleus.start - 0.3 * w && t <= nucleus.end) {
    return check("peakPlacement", "pass", `The rise is on ${name}. Exactly right.`, `ขึ้นเสียงที่ ${name} ถูกต้อง`);
  }
  // A rise that crosses halfway just before a syllable belongs to that syllable (same tolerance as the pass rule).
  const tw = t + 0.3 * w;
  const where = slots.find((s) => tw >= s.start && tw <= s.end) ?? nearestSlot(slots, t);
  const early = t < nucleus.start;
  const close = early ? t >= nucleus.start - 1.3 * w : t <= nucleus.end + w;
  return check(
    "peakPlacement",
    close ? "warn" : "fail",
    `Your rise is on ${where.syllable.text.toUpperCase()} (${early ? "too early" : "too late"}). Put it on ${name}, the stressed syllable of the last content word.`,
    `คุณขึ้นเสียงที่ ${where.syllable.text.toUpperCase()} (${early ? "เร็วไป" : "ช้าไป"}) ให้ขึ้นที่ ${name} ซึ่งเป็นพยางค์ที่ลงเสียงหนักของคำสำคัญคำสุดท้าย`,
  );
}

/** "About 2 semitones": how far the end was from where it needed to be, in words a learner can act on. */
function howFar(levels: number, dir: "higher" | "lower"): { en: string; th: string } {
  const st = Math.max(0.5, Math.round(Math.abs(levels) * SEMITONES_PER_LEVEL * 2) / 2);
  const n = st % 1 === 0 ? String(st) : st.toFixed(1);
  return {
    en: ` Your end needs to be about ${n} semitone${st === 1 ? "" : "s"} ${dir} (compared with your normal voice in this take).`,
    th: ` ตอนจบต้อง${dir === "higher" ? "สูง" : "ต่ำ"}กว่านี้อีกประมาณ ${n} ครึ่งเสียง (เทียบกับเสียงปกติของคุณในครั้งนี้)`,
  };
}

function checkEnding(pattern: PatternId, f: GroupFeatures): Check {
  const up = f.endSlope > 0.3;
  const down = f.endSlope < -0.3;
  switch (pattern) {
    case "2-3-1":
    case "3-1": {
      const low = f.endLow;
      const fall = f.maxLevel - low;
      if (up)
        return check(
          "ending",
          "fail",
          "Your voice went UP at the end. This pattern must go DOWN to sound finished.",
          "เสียงของคุณขึ้นตอนท้าย รูปแบบนี้ต้องลงเสียงต่ำเพื่อให้ฟังดูจบประโยค",
        );
      if (low <= 1.6 && fall >= THRESHOLDS.fallPass)
        return check("ending", "pass", "Nice fall to low (level 1) at the end.", "เสียงตกลงต่ำ (ระดับ 1) ตอนจบได้ดี");
      const lower = howFar(Math.max(low - 1.6, THRESHOLDS.fallPass - fall), "lower");
      if (low <= 2.1 && fall >= THRESHOLDS.fallWarn)
        return check("ending", "warn", "Good direction — fall a bit lower at the end." + lower.en, "ทิศทางถูกแล้ว ลงเสียงให้ต่ำกว่านี้อีกนิดตอนท้าย" + lower.th);
      return check(
        "ending",
        "fail",
        "Not falling enough. Drop to your low voice (level 1) at the end." + lower.en,
        "เสียงตกไม่พอ ให้ลงไปที่เสียงต่ำ (ระดับ 1) ตอนท้าย" + lower.th,
      );
    }
    case "2-3-2": {
      if (f.endLevel <= 1.5)
        return check(
          "ending",
          "fail",
          "You dropped to level 1, so it sounds finished. Come back only to level 2 — more is coming." + howFar(1.75 - f.endLevel, "higher").en,
          "คุณลงเสียงถึงระดับ 1 จึงฟังเหมือนจบแล้ว ให้กลับมาแค่ระดับ 2 เพราะยังพูดไม่จบ" + howFar(1.75 - f.endLevel, "higher").th,
        );
      if (f.endLevel > 2.6 && !down)
        return check(
          "ending",
          "warn",
          "You stayed high, which sounds like a question. Come back down to level 2." + howFar(f.endLevel - 2.4, "lower").en,
          "คุณค้างเสียงสูงไว้ ฟังเหมือนคำถาม ให้ลงกลับมาที่ระดับ 2" + howFar(f.endLevel - 2.4, "lower").th,
        );
      return check("ending", "pass", "Good: back to mid (level 2), so we know more is coming.", "ดีมาก กลับมาระดับ 2 ผู้ฟังรู้ว่ายังมีต่อ");
    }
    case "2-3": {
      if (f.endLevel >= 2.5 && f.endSlope > -0.2)
        return check("ending", "pass", "Nice rise — it stays high at the end.", "เสียงขึ้นและค้างสูงไว้ตอนท้ายได้ดี");
      if (down)
        return check(
          "ending",
          "fail",
          "Your voice went DOWN at the end. Yes/no questions and unsure tags go UP.",
          "เสียงของคุณลงตอนท้าย คำถาม Yes/No และ tag ที่ไม่แน่ใจต้องขึ้นเสียง",
        );
      const higher = howFar(2.5 - f.endLevel, "higher");
      if (f.endLevel >= 2.25)
        return check("ending", "warn", "Almost — go a little higher at the end." + higher.en, "เกือบแล้ว ขึ้นเสียงให้สูงกว่านี้อีกนิดตอนท้าย" + higher.th);
      return check("ending", "fail", "Not rising enough. Lift your voice up to level 3 at the end." + higher.en, "เสียงขึ้นไม่พอ ยกเสียงขึ้นไปถึงระดับ 3 ตอนท้าย" + higher.th);
    }
  }
}

function checkRange(_pattern: PatternId, f: GroupFeatures): Check {
  const st = (f.range * 4).toFixed(1);
  if (f.range >= THRESHOLDS.rangePass)
    return check("range", "pass", `Good pitch movement (${st} semitones).`, `เสียงมีขึ้นลงชัดเจน (${st} เซมิโทน)`);
  if (f.range >= THRESHOLDS.rangeWarn)
    return check(
      "range",
      "warn",
      `A bit flat (${st} semitones). Make the high part higher and the low part lower.`,
      `เสียงค่อนข้างเรียบ (${st} เซมิโทน) ให้ส่วนสูงสูงขึ้น และส่วนต่ำต่ำลง`,
    );
  return check(
    "range",
    "fail",
    `Too flat / monotone (${st} semitones). English needs a big rise and fall here.`,
    `เสียงเรียบเกินไป (${st} เซมิโทน) ภาษาอังกฤษต้องมีเสียงขึ้นและลงชัดเจนตรงนี้`,
  );
}

// ---------------------------------------------------------------------------
// Voice helpers: thought-group splitting and re-timing
// ---------------------------------------------------------------------------

/** Split a voice contour at its longest pauses (runs of unvoiced frames). */
export function splitByPauses(
  c: Contour,
  groups: number,
  durationSec: number,
): { segments: Contour[]; foundBreaks: boolean } {
  const first = c.findIndex((p) => p.v !== null);
  let last = -1;
  for (let i = c.length - 1; i >= 0; i--) if (c[i].v !== null) { last = i; break; }
  if (first < 0) return { segments: Array(groups).fill([]), foundBreaks: false };
  const voicedPart = c.slice(first, last + 1);
  if (groups === 1) return { segments: [voicedPart], foundBreaks: true };

  // Collect pauses inside the voiced part.
  const pauses: { from: number; to: number; len: number }[] = [];
  let i = 0;
  while (i < voicedPart.length) {
    if (voicedPart[i].v === null) {
      let j = i;
      while (j < voicedPart.length && voicedPart[j].v === null) j++;
      pauses.push({ from: i, to: j, len: voicedPart[j - 1].t - voicedPart[i].t });
      i = j;
    } else i++;
  }
  const minLen = durationSec > 0 ? THRESHOLDS.minBreakSec / durationSec : 0.03;
  const chosen = pauses
    .filter((p) => p.len >= minLen)
    .sort((a, b) => b.len - a.len)
    .slice(0, groups - 1)
    .sort((a, b) => a.from - b.from);

  if (chosen.length === groups - 1) {
    const segments: Contour[] = [];
    let start = 0;
    for (const p of chosen) {
      segments.push(voicedPart.slice(start, p.from));
      start = p.to;
    }
    segments.push(voicedPart.slice(start));
    return { segments, foundBreaks: true };
  }
  // No clear pauses: split evenly in time (rough fallback).
  const t0 = voicedPart[0].t;
  const t1 = voicedPart[voicedPart.length - 1].t;
  const segments: Contour[] = [];
  for (let g = 0; g < groups; g++) {
    const a = t0 + ((t1 - t0) * g) / groups;
    const b = t0 + ((t1 - t0) * (g + 1)) / groups;
    segments.push(voicedPart.filter((p) => p.t >= a && (g === groups - 1 ? p.t <= b : p.t < b)));
  }
  return { segments, foundBreaks: false };
}

/** Linearly map a segment's time range onto a target span (trimming unvoiced ends first). */
function retime(seg: Contour, span: { start: number; end: number }): Contour {
  const first = seg.findIndex((p) => p.v !== null);
  let last = -1;
  for (let i = seg.length - 1; i >= 0; i--) if (seg[i].v !== null) { last = i; break; }
  if (first < 0) return [];
  const core = seg.slice(first, last + 1);
  const a = core[0].t;
  const b = core[core.length - 1].t;
  const k = b > a ? (span.end - span.start) / (b - a) : 0;
  return core.map((p) => ({ t: span.start + (p.t - a) * k, v: p.v }));
}

function syllableLevels(layout: Layout, c: Contour): number[][] {
  const at = (t: number): number | null => {
    let best: { d: number; v: number } | null = null;
    for (const p of c) {
      if (p.v === null) continue;
      const d = Math.abs(p.t - t);
      if (!best || d < best.d) best = { d, v: p.v };
    }
    return best && best.d < 0.03 ? best.v : null;
  };
  return layout.slots.map((s) => {
    const w = s.end - s.start;
    const a = at(s.start + 0.25 * w);
    const b = at(s.start + 0.8 * w);
    return [a, b].map((x) => (x === null ? 0 : clamp(Math.round(x), 1, 4)));
  });
}

function nearestSlot(slots: SyllableSlot[], t: number): SyllableSlot {
  return slots.reduce((best, s) =>
    Math.abs((s.start + s.end) / 2 - t) < Math.abs((best.start + best.end) / 2 - t) ? s : best,
  );
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

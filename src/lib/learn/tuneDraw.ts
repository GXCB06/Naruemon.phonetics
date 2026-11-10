// "Draw the tune" on the sentence itself: the learner's stroke is read as a level (or a glide) per syllable, then graded
// with the course rules for every thought group. Pure: no DOM, no React. Ported from the tune-drawing prototype.
//
// Levels follow the course: 1 low, 2 mid, 3 high, 4 extra high. A syllable's levels are [a] (flat) or [a, b] (a glide
// inside the syllable, e.g. NAME [3, 1]).

import { GRID_STEP, layoutSentence } from "../intonation/contour.ts";
import type { Bilingual, Contour, PatternId, Sentence } from "../intonation/types.ts";

export type Levels = number[];

export interface DrawSyl {
  text: string;
  /** Index of the word inside its thought group (syllables of one word share it). */
  word: number;
  target: Levels;
}

export interface DrawGroup {
  pattern: PatternId;
  syl: DrawSyl[];
  /** Index (inside `syl`) of the nucleus: the stressed syllable of the last content word. */
  nucleus: number;
}

/** The sentence as the drawing exercise sees it: syllables per thought group, with their textbook levels. */
export function drawGroupsOf(sentence: Sentence): DrawGroup[] {
  return sentence.groups.map((g) => {
    const syl: DrawSyl[] = [];
    let nucleus = 0;
    g.words.forEach((w, wi) => {
      // punctuation lives on the word ("name?"), not on its syllables: show it after the last syllable
      const joined = w.syllables.map((s) => s.text).join("");
      const tail = w.text.toLowerCase().startsWith(joined.toLowerCase()) ? w.text.slice(joined.length) : "";
      w.syllables.forEach((s, si) => {
        if (wi === g.nucleus.word && si === g.nucleus.syllable) nucleus = syl.length;
        const text = si === w.syllables.length - 1 ? s.text + tail : s.text;
        syl.push({ text, word: wi, target: s.levels.map((v) => Math.round(v)) });
      });
    });
    return { pattern: g.pattern, syl, nucleus };
  });
}

export const totalSyllables = (groups: readonly DrawGroup[]): number => groups.reduce((n, g) => n + g.syl.length, 0);

/** The textbook levels of every syllable, in reading order. */
export function targetLevels(groups: readonly DrawGroup[]): Levels[] {
  return groups.flatMap((g) => g.syl.map((s) => s.target.slice()));
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading a stroke. `u` runs along the line in syllable units: syllable i owns u in [i, i + 1). `v` is a continuous level.
// ---------------------------------------------------------------------------------------------------------------------

export interface StrokePoint {
  u: number;
  v: number;
}

/** A syllable on one line of the drawing: its index in reading order and its thought group. */
export interface SlotRef {
  i: number;
  g: number;
}

/** The stroke's level at `u` (linear between samples), or null outside the stroke. Points must be sorted by u. */
export function sampleV(pts: readonly StrokePoint[], u: number): number | null {
  if (!pts.length || u < pts[0].u || u > pts[pts.length - 1].u) return null;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1];
    const b = pts[k];
    if (u <= b.u) {
      const f = b.u === a.u ? 0 : (u - a.u) / (b.u - a.u);
      return a.v + f * (b.v - a.v);
    }
  }
  return pts[pts.length - 1].v;
}

export const toLevel = (v: number): number => Math.max(1, Math.min(4, Math.round(v)));

/**
 * Read one stroke into levels for the syllables it covers (others keep their current value).
 * - A syllable counts only when the stroke reaches its middle.
 * - The END level of a syllable is read late in it; for the last syllable of a group, where the line finishes.
 * - The START level: people bend down soon after a step up, so a fall takes the highest point early in the syllable
 *   (on a wide word, even in its first tenth, unless that high point is just the previous syllable's level carried
 *   over the step). A rise inside one syllable happens late, so its low start is read from the middle.
 */
export function levelsFromStroke(
  points: readonly StrokePoint[],
  slots: readonly SlotRef[],
  current: readonly (Levels | null)[],
): { next: (Levels | null)[]; touched: boolean } {
  const pts = points.slice().sort((a, b) => a.u - b.u);
  const next = current.slice();
  if (pts.length < 2) return { next, touched: false };
  const lastU = pts[pts.length - 1].u;
  const range = (from: number, to: number, step: number): number[] => {
    const out: number[] = [];
    for (let u = from; u <= to + 1e-9; u += step) {
      const v = sampleV(pts, u);
      if (v !== null) out.push(v);
    }
    return out;
  };
  let touched = false;
  slots.forEach((s, k) => {
    const mid = [0.5, 0.4, 0.6].find((o) => sampleV(pts, s.i + o) !== null);
    if (mid === undefined) return;
    const lastInGroup = !slots[k + 1] || slots[k + 1].g !== s.g;
    const vb = lastInGroup
      ? sampleV(pts, Math.min(s.i + 0.97, lastU))
      : (sampleV(pts, s.i + 0.8) ?? sampleV(pts, s.i + mid));
    const early = range(s.i + 0.2, s.i + 0.5, 0.05);
    if (!early.length) early.push(sampleV(pts, s.i + mid)!);
    const wide = range(s.i + 0.03, s.i + 0.195, 0.03);
    const prevSlot = slots[k - 1];
    const prevLv = prevSlot && prevSlot.g === s.g ? next[prevSlot.i] : null;
    const prevEnd = prevLv ? prevLv[prevLv.length - 1] : null;
    const b = toLevel(vb ?? early[early.length - 1]);
    let a = toLevel(Math.max(...early));
    const hiWide = wide.length ? toLevel(Math.max(...wide)) : a;
    if (hiWide > a && hiWide > b && hiWide !== prevEnd) a = hiWide;
    if (a <= b) {
      const mids = range(s.i + 0.3, s.i + 0.5, 0.05);
      a = Math.min(toLevel(Math.min(...(mids.length ? mids : early))), b);
    }
    next[s.i] = a === b ? [a] : [a, b];
    touched = true;
  });
  return { next, touched };
}

// ---------------------------------------------------------------------------------------------------------------------
// Grading with the course rules
// ---------------------------------------------------------------------------------------------------------------------

export const PATTERN_INFO: Record<PatternId, Bilingual> = {
  "2-3-1": { en: "Falling 2-3-1: finished", th: "เสียงตก 2-3-1: พูดจบแล้ว" },
  "2-3-2": { en: "Non-final 2-3-2: more is coming", th: "ยังไม่จบ 2-3-2: ยังมีต่อ" },
  "2-3": { en: "Rising 2-3: stays up", th: "เสียงขึ้น 2-3: ค้างเสียงสูงไว้" },
  "3-1": { en: "Tag, sure 3-1: the tag falls", th: "Tag แบบมั่นใจ 3-1: tag ลงเสียง" },
};
const ENDING_RULE: Record<PatternId, Bilingual> = {
  "2-3-1": { en: "Fall to low (1) at the end", th: "ลงถึงเสียงต่ำ (ระดับ 1) ตอนท้าย" },
  "2-3-2": { en: "Come back to mid (2)", th: "กลับมาที่เสียงกลาง (ระดับ 2)" },
  "2-3": { en: "Stay up at the end", th: "ค้างเสียงสูงไว้ตอนท้าย" },
  "3-1": { en: "Fall to low (1)", th: "ลงถึงเสียงต่ำ (ระดับ 1)" },
};
const ENDING_OK: Record<PatternId, Bilingual> = {
  "2-3-1": { en: "Your line falls to low (1) at the end, so it sounds finished.", th: "เส้นของคุณลงถึงเสียงต่ำ (ระดับ 1) ตอนท้าย จึงฟังดูจบ" },
  "2-3-2": {
    en: "Your line comes back to mid (2), not low, so the listener knows more is coming.",
    th: "เส้นของคุณกลับมาที่เสียงกลาง (ระดับ 2) ไม่ลงต่ำ ผู้ฟังจึงรู้ว่ายังมีต่อ",
  },
  "2-3": { en: "Your line stays up at the end, like a real question.", th: "เส้นของคุณค้างเสียงสูงไว้ตอนท้าย เหมือนถามจริง ๆ" },
  "3-1": { en: "Your tag falls to low (1): you expect the listener to agree.", th: "tag ของคุณลงถึงเสียงต่ำ (ระดับ 1): คุณมั่นใจว่าผู้ฟังจะเห็นด้วย" },
};

export type RuleId = "cover" | "start" | "rise" | "single" | "end";

export interface RuleCheck {
  id: RuleId;
  /** Reading order in Answer details. */
  ord: number;
  /** Which failure the feedback sheet shows first (lowest wins): the ending decides the meaning, so it comes early. */
  prio: number;
  ok: boolean;
  /** The syllable (index inside the group) the check is about. */
  si: number;
  rule: Bilingual;
  message: Bilingual;
}

export interface GroupReport {
  group: DrawGroup;
  mine: (Levels | null)[];
  /** Index of the group's first syllable in reading order. */
  base: number;
  checks: RuleCheck[];
  /** False when part of the group is not drawn: the other rules wait. */
  complete: boolean;
}

/** A syllable as printed in feedback: "TA-" for the first syllable of TABLE, "NAME" for a whole word. */
export function syllableLabel(group: DrawGroup, si: number): string {
  const s = group.syl[si];
  const text = s.text.replace(/[.,?!;:]/g, "").toUpperCase();
  const multi = group.syl.filter((x) => x.word === s.word).length > 1;
  const last = si === group.syl.length - 1 || group.syl[si + 1].word !== s.word;
  return multi && !last ? text + "-" : text;
}
function wordLabel(group: DrawGroup, si: number): string {
  const w = group.syl[si].word;
  return group.syl
    .filter((x) => x.word === w)
    .map((x) => x.text)
    .join("")
    .replace(/[.,?!;:]/g, "")
    .toUpperCase();
}

export function groupReport(group: DrawGroup, mine: readonly (Levels | null)[], base = 0): GroupReport {
  const n = group.syl.length;
  const label = (si: number) => syllableLabel(group, si);
  const checks: RuleCheck[] = [];
  const add = (id: RuleId, ord: number, prio: number, ok: boolean, si: number, rule: Bilingual, message: Bilingual) =>
    checks.push({ id, ord, prio, ok, si, rule, message });

  const missing = mine.findIndex((x) => !x);
  if (missing >= 0) {
    add("cover", 0, 0, false, missing, { en: "Draw the whole part", th: "วาดให้ครบทั้งส่วน" }, {
      en: `Nothing is drawn under ${label(missing)}. Draw across the whole part, from the first word to the last.`,
      th: `ยังไม่มีเส้นใต้ ${label(missing)} ลากเส้นให้ครบทั้งส่วน ตั้งแต่คำแรกจนถึงคำสุดท้าย`,
    });
    return { group, mine: mine.slice(), base, checks, complete: false };
  }
  const seq: { v: number; si: number }[] = [];
  (mine as Levels[]).forEach((lv, si) => lv.forEach((v) => seq.push({ v, si })));
  const first = seq[0].v;
  const last = seq[seq.length - 1].v;
  const P = group.pattern;
  const L = n - 1;
  const nuc = label(group.nucleus);
  const word = wordLabel(group, group.nucleus);

  const endOk = P === "2-3" ? last >= 3 : last === group.syl[L].target[group.syl[L].target.length - 1];
  let endMsg = ENDING_OK[P];
  if (!endOk) {
    if (P === "2-3") endMsg = { en: "Your line goes DOWN at the end. This one stays UP.", th: "เส้นของคุณลงตอนท้าย ประโยคนี้ต้องค้างเสียงสูงไว้" };
    else if (P === "2-3-2")
      endMsg =
        last === 1
          ? { en: "You dropped to 1, so it sounds finished. Come back only to 2: more is coming.", th: "คุณลงถึงระดับ 1 จึงฟังเหมือนจบแล้ว ให้กลับมาแค่ระดับ 2 เพราะยังพูดไม่จบ" }
          : { en: `Your line ends at ${last}. After the rise, come back down to 2.`, th: `เส้นของคุณจบที่ระดับ ${last} หลังจากขึ้นเสียงแล้ว ให้ลงกลับมาที่ระดับ 2` };
    else if (P === "3-1")
      endMsg = { en: `You're sure, so the tag falls: start high on ${label(0)} and drop to low (1).`, th: `เมื่อมั่นใจ tag ต้องตก เริ่มสูงที่ ${label(0)} แล้วลงต่ำ (ระดับ 1)` };
    else
      endMsg =
        last >= 3
          ? { en: "Your line goes UP at the end. This one falls to low (1) to sound finished.", th: "เส้นของคุณขึ้นตอนท้าย ประโยคนี้ต้องลงต่ำ (ระดับ 1) ให้ฟังดูจบ" }
          : { en: `Almost. Your line ends at ${last}. Drop all the way to low (1) at the end.`, th: `เกือบแล้ว เส้นของคุณจบที่ระดับ ${last} ลงให้ถึงเสียงต่ำ (ระดับ 1) ตอนท้าย` };
  }
  add("end", 4, 1, endOk, L, ENDING_RULE[P], endMsg);

  if (P === "3-1") {
    add("start", 1, 2, first >= 3, 0, { en: "Start the tag high (3)", th: "เริ่ม tag ที่เสียงสูง (ระดับ 3)" }, first >= 3
      ? { en: `Your tag starts high (3) on ${label(0)}, then falls.`, th: `tag ของคุณเริ่มสูง (ระดับ 3) ที่ ${label(0)} แล้วลง` }
      : { en: `Your tag starts at ${first}. Start it high (3) on ${label(0)}, then fall.`, th: `tag ของคุณเริ่มที่ระดับ ${first} ให้เริ่มสูง (ระดับ 3) ที่ ${label(0)} แล้วค่อยลง` });
    return { group, mine: mine.slice(), base, checks, complete: true };
  }

  const riseAt = seq.find((x) => x.v >= 3);
  const riseRule = { en: `Rise on ${nuc}`, th: `ขึ้นเสียงที่ ${nuc}` };
  if (!riseAt)
    add("rise", 2, 2, false, group.nucleus, riseRule, { en: `Your line never reaches level 3. Rise up to 3 on ${nuc}.`, th: `เส้นของคุณไม่ถึงระดับ 3 ขึ้นเสียงไประดับ 3 ที่ ${nuc}` });
  else if (riseAt.si !== group.nucleus) {
    const where = label(riseAt.si);
    add("rise", 2, 2, false, riseAt.si, riseRule, {
      en: `Your rise is on ${where}. Put it on ${nuc}, the stressed syllable of ${word}, the last important word.`,
      th: `คุณขึ้นเสียงที่ ${where} ให้ขึ้นที่ ${nuc} ซึ่งเป็นพยางค์เน้นของ ${word} คำสำคัญคำสุดท้าย`,
    });
  } else
    add("rise", 2, 2, true, group.nucleus, riseRule, {
      en: `Your rise is on ${nuc}, the stressed syllable of ${word}, the last important word.`,
      th: `คุณขึ้นเสียงที่ ${nuc} ซึ่งเป็นพยางค์เน้นของ ${word} คำสำคัญคำสุดท้าย`,
    });

  let runs = 0;
  let inRun = false;
  let secondAt = group.nucleus;
  for (const x of seq) {
    if (x.v >= 3 && !inRun) {
      runs++;
      inRun = true;
      if (runs === 2) secondAt = x.si;
    } else if (x.v < 3) inRun = false;
  }
  add("single", 3, 3, runs <= 1, secondAt, { en: "Only one rise", th: "ขึ้นเสียงครั้งเดียว" }, runs <= 1
    ? { en: "Only one rise in this part. The other words stay at mid (2).", th: "ขึ้นเสียงครั้งเดียวในส่วนนี้ คำอื่นอยู่ที่เสียงกลาง (ระดับ 2)" }
    : { en: `You rise again on ${label(secondAt)}. Only one rise per part: don't give every word its own tone.`, th: `คุณขึ้นเสียงอีกครั้งที่ ${label(secondAt)} ขึ้นเสียงได้ครั้งเดียวต่อหนึ่งส่วน อย่าใส่เสียงสูงให้ทุกคำ` });

  add("start", 1, 4, first === 2, 0, { en: "Start at mid (2)", th: "เริ่มที่เสียงกลาง (ระดับ 2)" }, first === 2
    ? { en: "Your line starts at mid (2), your normal speaking voice.", th: "เส้นของคุณเริ่มที่ระดับ 2 ซึ่งเป็นเสียงพูดปกติ" }
    : { en: `Your line starts at level ${first}. Start at your normal mid voice (2).`, th: `เส้นของคุณเริ่มที่ระดับ ${first} ให้เริ่มที่เสียงกลางปกติ (ระดับ 2)` });
  return { group, mine: mine.slice(), base, checks, complete: true };
}

const tuneEn = (lv: Levels) => (lv.length === 1 ? `stays at ${lv[0]}` : lv[1] < lv[0] ? `falls ${lv[0]}→${lv[1]}` : `rises ${lv[0]}→${lv[1]}`);
const tuneTh = (lv: Levels) => (lv.length === 1 ? `อยู่ที่ระดับ ${lv[0]}` : lv[1] < lv[0] ? `ลงจาก ${lv[0]} ไป ${lv[1]}` : `ขึ้นจาก ${lv[0]} ไป ${lv[1]}`);

/** Where the drawing first differs from the book's line, said as a "for a Perfect" hint; null when every syllable matches. */
export function perfectDiff(groups: readonly DrawGroup[], assigned: readonly (Levels | null)[]): ({ i: number } & Bilingual) | null {
  let i = 0;
  for (const g of groups)
    for (let si = 0; si < g.syl.length; si++, i++) {
      const want = g.syl[si].target;
      const got = assigned[i];
      if (!got || got.join() !== want.join()) {
        const L = syllableLabel(g, si);
        return {
          i,
          en: `For a Perfect: on ${L} the book's line ${tuneEn(want)}, yours ${got ? tuneEn(got) : "is missing"}.`,
          th: `ถ้าจะได้ Perfect: ที่ ${L} เส้นในหนังสือ${tuneTh(want)} แต่ของคุณ${got ? tuneTh(got) : "ยังไม่มีเส้น"}`,
        };
      }
    }
  return null;
}

export type DrawGrade = "perfect" | "good" | "miss";

export interface DrawVerdict {
  grade: DrawGrade;
  reports: GroupReport[];
  /** The feedback line: the first failed rule (by priority), or null when every rule passes. */
  failure: { at: number; message: Bilingual } | null;
  /** Reading-order index of every group's nucleus. */
  nuclei: number[];
  /** Good only: the first syllable that differs from the book. */
  diff: ({ i: number } & Bilingual) | null;
}

/** Grade a drawing: every rule of every thought group, then Perfect (matches the book) / Good (rules pass) / Miss. */
export function evaluateDrawing(groups: readonly DrawGroup[], assigned: readonly (Levels | null)[]): DrawVerdict {
  const reports: GroupReport[] = [];
  const nuclei: number[] = [];
  let base = 0;
  let failure: DrawVerdict["failure"] = null;
  for (const g of groups) {
    const rep = groupReport(g, assigned.slice(base, base + g.syl.length), base);
    reports.push(rep);
    nuclei.push(base + g.nucleus);
    if (!failure) {
      const f = rep.checks.filter((c) => !c.ok).sort((a, b) => a.prio - b.prio)[0];
      if (f) failure = { at: base + f.si, message: f.message };
    }
    base += g.syl.length;
  }
  if (failure) return { grade: "miss", reports, failure, nuclei, diff: null };
  const diff = perfectDiff(groups, assigned);
  return { grade: diff ? "good" : "perfect", reports, failure: null, nuclei, diff };
}

/** Engine score for the lesson summary: Perfect 100, Good 85, Miss scaled by the share of rules passed (max 60). */
export function drawScore(v: DrawVerdict): number {
  if (v.grade === "perfect") return 100;
  if (v.grade === "good") return 85;
  const all = v.reports.flatMap((r) => r.checks);
  const ok = all.filter((c) => c.ok).length;
  return Math.round((60 * ok) / Math.max(1, all.length + v.reports.filter((r) => !r.complete).length * 3));
}

/**
 * The drawing as a contour on the sentence's 0..1 time axis (for the analytics engine and saved attempts): flat syllables
 * stay level, falls happen early in the syllable and rises late, like the hummed tune. Undrawn time is null.
 */
export function levelsToContour(sentence: Sentence, assigned: readonly (Levels | null)[]): Contour {
  const layout = layoutSentence(sentence);
  const out: Contour = [];
  let k = 0;
  for (let t = 0; t <= 1 + 1e-9; t += GRID_STEP) {
    while (k < layout.slots.length - 1 && t >= layout.slots[k].end) k++;
    const s = layout.slots[k];
    const lv = t >= s.start && t < s.end + 1e-9 ? assigned[k] : null;
    let v: number | null = null;
    if (lv) {
      const f = (t - s.start) / (s.end - s.start);
      const a = lv[0];
      const b = lv[lv.length - 1];
      if (a === b) v = a;
      else if (b < a) v = f < 0.15 ? a : f > 0.6 ? b : a + ((b - a) * (f - 0.15)) / 0.45;
      else v = f < 0.4 ? a : f > 0.92 ? b : a + ((b - a) * (f - 0.4)) / 0.52;
    }
    out.push({ t: Math.round(t * 1e6) / 1e6, v });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// The textbook step line: flat across each syllable, vertical steps between syllables, a glide drawn as a tight bend
// (about as wide as it is tall, like the book) followed by a flat run. Returns SVG path data.
// ---------------------------------------------------------------------------------------------------------------------

export interface StepCell {
  x0: number;
  x1: number;
  /** Thought group: no step is drawn across a group boundary. */
  g: number;
  /** Reading-order index into `levels`. */
  i: number;
}

export function stepPath(cells: readonly StepCell[], levels: readonly (Levels | null)[], yOf: (v: number) => number, tail = 0): string {
  const f = (n: number) => n.toFixed(1);
  let d = "";
  let prev: number | null = null;
  let prevGroup: number | null = null;
  cells.forEach((s, k) => {
    const lv = levels[s.i];
    if (!lv) {
      prev = null;
      return;
    }
    const a = lv[0];
    const b = lv[lv.length - 1];
    const ya = yOf(a);
    const yb = yOf(b);
    if (prev !== null && prevGroup === s.g) d += ` L${f(s.x0)} ${f(yOf(prev))} L${f(s.x0)} ${f(ya)}`;
    else d += ` M${f(s.x0)} ${f(ya)}`;
    const nextCell = cells[k + 1];
    const lastInGroup = !nextCell || nextCell.g !== s.g;
    const avail = s.x1 - s.x0;
    const ry = Math.max(1, Math.abs(yb - ya));
    const rx = Math.max(1, Math.min(avail * 0.8, ry * 1.15));
    if (a === b) d += ` L${f(s.x1)} ${f(ya)}`;
    else if (b < a) {
      const xs = s.x0 + Math.min(avail * 0.08, ry * 0.15);
      d += ` L${f(xs)} ${f(ya)} A${f(rx)} ${f(ry)} 0 0 1 ${f(xs + rx)} ${f(yb)} L${f(s.x1)} ${f(yb)}`;
    } else d += ` L${f(s.x1 - rx)} ${f(ya)} A${f(rx)} ${f(ry)} 0 0 0 ${f(s.x1)} ${f(yb)}`;
    if (lastInGroup && tail && !(b > a)) d += ` L${f(s.x1 + tail)} ${f(yb)}`;
    prev = b;
    prevGroup = s.g;
  });
  return d.trim();
}

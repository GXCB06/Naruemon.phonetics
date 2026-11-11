// "Build the tune": the learner taps number tiles (pitch levels) and "|" tiles (thought-group breaks) into a line,
// like a word bank. Pure and deterministic.

import type { Bilingual, Sentence } from "../intonation/types.ts";

/** The tune of a sentence as tiles: "2-3-2 | 2-3-1" → ["2", "3", "2", "|", "2", "3", "1"]. */
export function tuneTiles(sentence: Sentence): string[] {
  return sentence.groups.flatMap((g, i) => [...(i > 0 ? ["|"] : []), ...g.pattern.split("-")]);
}

/** The tune written the course way: "2-3-2 | 2-3-1". */
export function tuneText(tiles: readonly string[]): string {
  return tiles.join("-").replace(/-\|-/g, " | ");
}

/** Small seeded shuffle (mulberry32), so a lesson always shows the same bank. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A number from a string, for seeding. */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The tile bank: every tile of the answer plus distractors that make the typical mistakes buildable
 * (an extra 1 = "finished" too early, an extra 3 = "stays up", a 4 = too high). Order is shuffled by `seed`.
 */
export function tuneBank(sentence: Sentence, seed: number): string[] {
  const answer = tuneTiles(sentence);
  const extra = sentence.groups.length > 1 ? ["1", "3"] : answer.includes("1") ? ["3", "4"] : ["1", "4"];
  return seededShuffle([...answer, ...extra], seed);
}

export function sameTune(picked: readonly string[], answer: readonly string[]): boolean {
  return picked.length === answer.length && picked.every((t, i) => t === answer[i]);
}

const PATTERN_WORDS: Record<string, Bilingual> = {
  "2-3-1": { en: "2-3-1 falls: finished", th: "2-3-1 เสียงตก: จบความ" },
  "2-3-2": { en: "2-3-2 comes back to mid: more is coming", th: "2-3-2 กลับมาระดับกลาง: ยังมีต่อ" },
  "2-3": { en: "2-3 rises and stays up", th: "2-3 ขึ้นสูงแล้วค้างไว้" },
  "3-1": { en: "a sure tag starts high and falls (3-1)", th: "คำถามท้ายแบบมั่นใจ เริ่มสูงแล้วตก (3-1)" },
};

/** Feedback for "Build the tune". */
export function buildFeedback(right: boolean, sentence: Sentence): { passed: boolean; title: Bilingual; detail: Bilingual } {
  const answer = tuneText(tuneTiles(sentence));
  const why = sentence.groups.map((g) => PATTERN_WORDS[g.pattern] ?? { en: g.pattern, th: g.pattern });
  const uniq = why.filter((w, i) => why.findIndex((x) => x.en === w.en) === i);
  const reason: Bilingual = { en: uniq.map((w) => w.en).join("; "), th: uniq.map((w) => w.th).join(" · ") };
  // one group: the reason already starts with the tune; several: say the whole tune first
  const detail: Bilingual =
    sentence.groups.length > 1 ? { en: `${answer}. ${reason.en}.`, th: `${answer} · ${reason.th}` } : { en: `${reason.en}.`, th: reason.th };
  return right
    ? { passed: true, title: { en: "Nice!", th: "เยี่ยม!" }, detail }
    : { passed: false, title: { en: "Correct tune:", th: "ทำนองที่ถูก:" }, detail };
}

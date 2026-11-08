// Turn authored lesson sentences (text + nucleus word) into full `Sentence` objects.
// Pure: no fs, no DOM. tools/build-lessons.ts feeds it the CMUdict-based word table and writes the JSON files.
//
// What a human writes: the sentence text, which word carries the nucleus of each thought group, a kind, (for sentences
// with several thought groups) how many words each group has, and (for words of 2+ syllables) how to spell the syllable
// chunks, e.g. "ta-ble". Everything else is generated: IPA and syllable count come from the word table, the nucleus
// syllable is the dictionary's primary-stress syllable of that word, and the pitch levels come from `levelsForGroup`
// (falling 2-3-1) or `levelsForRisingGroup` (rising 2-3). The kind decides the pattern of every group.

import { normalizeWord } from "../ipa/words.ts";
import type { WordIpa } from "../ipa/words.ts";
import type { Bilingual, PatternId, Sentence, Syllable, ThoughtGroup, Word } from "./types.ts";

export type SentenceKind = "statement" | "wh" | "command" | "exclamation" | "yesno" | "address" | "interjection";

/** Every thought group of a sentence of this kind uses this pattern. */
export function patternForKind(kind: SentenceKind): PatternId {
  return kind === "yesno" || kind === "address" || kind === "interjection" ? "2-3" : "2-3-1";
}

export interface SentenceSource {
  /** Stable id; also the name of the reference audio file (`/audio/<id>--f.mp3`). */
  id: string;
  text: string;
  kind: SentenceKind;
  /**
   * Index (0-based, whitespace-separated, counted over the whole sentence) of the last content word of a thought group:
   * the word that carries the peak. One number per thought group (a plain number when there is only one group).
   */
  nucleusWord: number | number[];
  /** Words in each thought group, in order (they add up to the word count). Omit for a single group. */
  groupSizes?: number[];
  /** Syllable spelling chunks for words of 2+ syllables, keyed by the lower-case word: `{ "table": "ta-ble" }`. */
  spelling?: Record<string, string>;
}

export interface LessonSource {
  id: string;
  unit: string;
  sentences: SentenceSource[];
}

/**
 * Target levels for one falling (2-3-1) thought group, one entry per syllable:
 * syllables before the nucleus = 2, the nucleus = 3, syllables after it = 1.
 * When the nucleus is the last syllable there is nothing after it, so it glides [3, 1] (rise, then fall) inside the syllable.
 */
export function levelsForGroup(syllableCount: number, nucleusIndex: number): number[][] {
  if (!Number.isInteger(syllableCount) || syllableCount < 1) throw new Error(`Bad syllable count ${syllableCount}`);
  if (!Number.isInteger(nucleusIndex) || nucleusIndex < 0 || nucleusIndex >= syllableCount) {
    throw new Error(`Nucleus ${nucleusIndex} is outside 0..${syllableCount - 1}`);
  }
  return Array.from({ length: syllableCount }, (_, i) =>
    i < nucleusIndex ? [2] : i === nucleusIndex ? (i === syllableCount - 1 ? [3, 1] : [3]) : [1],
  );
}

/**
 * Target levels for one rising (2-3) thought group, one entry per syllable. Start at 2, rise to 3 on the nucleus and STAY
 * high; syllables after the nucleus keep rising slightly (the last one glides [3, 3.4]):
 *  - before the nucleus: 2
 *  - the nucleus: 3 (glides [2, 3] when it is the first syllable, so the group still starts at 2)
 *  - after the nucleus: 3, the last syllable [3, 3.4]
 *  - when the nucleus is the last syllable there is nothing after it, so it glides up inside the syllable:
 *    [2.5, 3.4] (or [2, 3.4] when it is also the only syllable)
 */
export function levelsForRisingGroup(syllableCount: number, nucleusIndex: number): number[][] {
  if (!Number.isInteger(syllableCount) || syllableCount < 1) throw new Error(`Bad syllable count ${syllableCount}`);
  if (!Number.isInteger(nucleusIndex) || nucleusIndex < 0 || nucleusIndex >= syllableCount) {
    throw new Error(`Nucleus ${nucleusIndex} is outside 0..${syllableCount - 1}`);
  }
  const last = syllableCount - 1;
  return Array.from({ length: syllableCount }, (_, i) => {
    if (i < nucleusIndex) return [2];
    if (i === nucleusIndex) {
      if (i === 0) return i === last ? [2, 3.4] : [2, 3];
      return i === last ? [2.5, 3.4] : [3];
    }
    return i === last ? [3, 3.4] : [3];
  });
}

const KIND_LABEL: Record<SentenceKind, string> = {
  statement: "Statement",
  wh: "Wh-question",
  command: "Command",
  exclamation: "Exclamation",
  yesno: "Yes/no question",
  address: "Direct address",
  interjection: "Interjection",
};

/** "TA-", "-RIVE", "-TU-" or "NAME": how the nucleus chunk is written in the hint. */
export function nucleusLabel(chunks: string[], index: number): string {
  const c = chunks[index].toUpperCase();
  if (chunks.length === 1) return c;
  return `${index > 0 ? "-" : ""}${c}${index < chunks.length - 1 ? "-" : ""}`;
}

/** `labels` has one entry per thought group (a plain string for a single group). */
export function noteFor(kind: SentenceKind, labels: string | string[]): Bilingual {
  const all = Array.isArray(labels) ? labels : [labels];
  const label = all[0];
  switch (kind) {
    case "statement":
      return {
        en: `Statements fall: 2-3-1. The rise is on ${label} (last content word), then drop to 1.`,
        th: `ประโยคบอกเล่าใช้เสียงตก 2-3-1 ขึ้นสูงที่ ${label} (คำสำคัญคำสุดท้าย) แล้วลงต่ำ`,
      };
    case "wh":
      return {
        en: `Wh-questions FALL (2-3-1), they don't rise. The peak is on ${label}, then drop to 1.`,
        th: `คำถาม Wh- ใช้เสียงตก 2-3-1 ไม่ใช่เสียงขึ้น ขึ้นสูงที่ ${label} แล้วลงต่ำ`,
      };
    case "command":
      return {
        en: `Commands fall: 2-3-1. The rise is on ${label}, then drop to 1.`,
        th: `ประโยคคำสั่งใช้เสียงตก 2-3-1 ขึ้นสูงที่ ${label} แล้วลงต่ำ`,
      };
    case "exclamation":
      return {
        en: `Exclamations fall too: 2-3-1. The peak is on ${label}, then drop to 1.`,
        th: `ประโยคอุทานก็ใช้เสียงตก 2-3-1 ขึ้นสูงที่ ${label} แล้วลงต่ำ`,
      };
    case "yesno":
      return {
        en: `Yes/no questions RISE (2-3). Rise on ${label} and stay up to the end.`,
        th: `คำถาม Yes/No ใช้เสียงขึ้น 2-3 ขึ้นที่ ${label} และค้างเสียงสูงไว้จนจบ`,
      };
    case "address":
    case "interjection": {
      const first = kind === "address" ? { en: "The name", th: "ชื่อที่เรียก" } : { en: "The interjection", th: "คำอุทาน" };
      const second = all[1] ?? label;
      return {
        en: `${first.en} rises (2-3) on ${label}, then the question rises (2-3) on ${second}. Two thought groups, two peaks, and both stay up.`,
        th: `${first.th}ใช้เสียงขึ้น 2-3 ที่ ${label} แล้วคำถามก็ขึ้น 2-3 ที่ ${second} มี 2 กลุ่มคำ 2 จุดสูงสุด และค้างเสียงสูงไว้ทั้งสองกลุ่ม`,
      };
    }
  }
}

/** Spelling chunks of one word. Words of 2+ syllables need an entry in `spelling` ("ta-ble"); it is verified, never guessed. */
function chunksFor(raw: string, key: string, syllableCount: number, spelling: Record<string, string> | undefined): string[] {
  const core = raw.replace(/[^A-Za-z']/g, "");
  if (syllableCount === 1) return [core];
  const spec = spelling?.[key];
  if (!spec) {
    throw new Error(`"${key}" has ${syllableCount} syllables: add spelling chunks, e.g. { "${key}": "${key.slice(0, 2)}-${key.slice(2)}" }`);
  }
  const chunks = spec.split("-");
  if (chunks.length !== syllableCount) {
    throw new Error(`Spelling "${spec}" has ${chunks.length} chunk(s) but "${key}" has ${syllableCount} syllable(s) in the dictionary`);
  }
  if (chunks.join("").toLowerCase() !== core.toLowerCase()) {
    throw new Error(`Spelling "${spec}" does not spell "${core}"`);
  }
  // re-cut the real spelling so a capital letter ("Speak") survives
  let pos = 0;
  return chunks.map((c) => {
    const out = core.slice(pos, pos + c.length);
    pos += c.length;
    return out;
  });
}

/** Build a sentence: one or more thought groups, all with the pattern its kind calls for. */
export function buildSentence(src: SentenceSource, table: Readonly<Record<string, WordIpa>>): Sentence {
  const rawWords = src.text.trim().split(/\s+/);
  const sizes = src.groupSizes ?? [rawWords.length];
  if (sizes.some((n) => !Number.isInteger(n) || n < 1) || sizes.reduce((a, b) => a + b, 0) !== rawWords.length) {
    throw new Error(`${src.id}: groupSizes [${sizes.join(", ")}] do not add up to the ${rawWords.length} words of "${src.text}"`);
  }
  const nuclei = Array.isArray(src.nucleusWord) ? src.nucleusWord : [src.nucleusWord];
  if (nuclei.length !== sizes.length) {
    throw new Error(`${src.id}: ${sizes.length} thought group(s) need ${sizes.length} nucleusWord value(s), got ${nuclei.length}`);
  }

  // every nucleus must lie inside its own thought group (checked before any dictionary lookup)
  let from = 0;
  sizes.forEach((size, gi) => {
    if (!Number.isInteger(nuclei[gi]) || nuclei[gi] < from || nuclei[gi] >= from + size) {
      throw new Error(`${src.id}: nucleusWord ${nuclei[gi]} is outside the ${size} word(s) of thought group ${gi + 1} of "${src.text}"`);
    }
    from += size;
  });

  const entries = rawWords.map((raw) => {
    const key = normalizeWord(raw);
    const entry = table[key];
    if (!entry) throw new Error(`${src.id}: no IPA for "${key}"`);
    return { raw, key, entry, chunks: chunksFor(raw, key, entry.syllables.length, src.spelling) };
  });

  const pattern = patternForKind(src.kind);
  const labels: string[] = [];
  let first = 0;
  const groups: ThoughtGroup[] = sizes.map((size, gi) => {
    const nucleusWord = nuclei[gi] - first; // index inside this group
    const group = entries.slice(first, first + size);
    first += size;

    // Nucleus syllable = primary-stress syllable of the nucleus word (the only syllable of a one-syllable word).
    const nWord = group[nucleusWord];
    const nSyl = nWord.entry.syllables.length === 1 ? 0 : nWord.entry.syllables.findIndex((s) => s.stress === 1);
    if (nSyl < 0) throw new Error(`${src.id}: "${nWord.key}" has no primary-stress syllable in the dictionary`);
    labels.push(nucleusLabel(nWord.chunks, nSyl));

    // Flat syllable index of the nucleus within the group, for the levels.
    let flatNucleus = nSyl;
    for (let i = 0; i < nucleusWord; i++) flatNucleus += group[i].entry.syllables.length;
    const total = group.reduce((n, e) => n + e.entry.syllables.length, 0);
    const levels = pattern === "2-3" ? levelsForRisingGroup(total, flatNucleus) : levelsForGroup(total, flatNucleus);

    let flat = 0;
    const words: Word[] = group.map((e, wi) => {
      const multi = e.entry.syllables.length > 1;
      const syllables: Syllable[] = e.entry.syllables.map((s, si) => {
        const syl: Syllable = { text: e.chunks[si], ipa: s.ipa, levels: levels[flat++] };
        if ((multi && s.stress === 1) || (wi === nucleusWord && si === nSyl)) syl.stressed = true;
        return syl;
      });
      return { text: e.raw, syllables };
    });
    return { pattern, words, nucleus: { word: nucleusWord, syllable: nSyl } };
  });

  return {
    id: src.id,
    text: src.text,
    kind: KIND_LABEL[src.kind],
    note: noteFor(src.kind, labels),
    groups,
  };
}

/** Every distinct normalised word used by a lesson source (for the dictionary lookup). */
export function lessonWords(lesson: LessonSource): string[] {
  const out: string[] = [];
  for (const s of lesson.sentences) {
    for (const raw of s.text.trim().split(/\s+/)) {
      const w = normalizeWord(raw);
      if (w && !out.includes(w)) out.push(w);
    }
  }
  return out;
}

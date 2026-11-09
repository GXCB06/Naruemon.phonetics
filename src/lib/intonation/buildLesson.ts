// Turn authored lesson sentences (text + nucleus word) into full `Sentence` objects.
// Pure: no fs, no DOM. tools/build-lessons.ts feeds it the CMUdict-based word table and writes the JSON files.
//
// What a human writes: the sentence text, which word carries the nucleus of each thought group, a kind, (for sentences
// with several thought groups) how many words each group has, and (for words of 2+ syllables) how to spell the syllable
// chunks, e.g. "ta-ble". Everything else is generated: IPA and syllable count come from the word table, the nucleus
// syllable is the dictionary's primary-stress syllable of that word, and the pitch levels come from `levelsForGroup`
// (falling 2-3-1), `levelsForRisingGroup` (rising 2-3) or `levelsForNonFinalGroup` (non-final 2-3-2). The kind decides
// the pattern of every group, unless the source authors one pattern per group (`patterns`), which lists and non-final
// sentences need because their groups differ.

import { normalizeWord } from "../ipa/words.ts";
import type { WordIpa } from "../ipa/words.ts";
import type { Bilingual, PatternId, Sentence, Syllable, ThoughtGroup, Word } from "./types.ts";

export type SentenceKind =
  | "statement"
  | "wh"
  | "command"
  | "exclamation"
  | "yesno"
  | "address"
  | "interjection"
  | "list"
  | "choice"
  | "nonfinal"
  | "tag";

/**
 * Every thought group of a sentence of this kind uses this pattern, unless the source lists `patterns` (alias `groupPatterns`).
 * The kinds whose groups differ ("list", "nonfinal") name the pattern of their NON-FINAL groups here; `patternsFor`
 * decides the last group. A "tag" sentence always lists its patterns: the statement is 2-3-1, the tag is 3-1 when the
 * speaker is sure and 2-3 when not.
 */
export function patternForKind(kind: SentenceKind): PatternId {
  if (kind === "nonfinal") return "2-3-2";
  return kind === "yesno" || kind === "address" || kind === "interjection" || kind === "list" || kind === "choice" ? "2-3" : "2-3-1";
}

/**
 * The pattern of each thought group. An authored `patterns` list wins. Otherwise lists and non-final sentences use their
 * kind's pattern for every group except the last, which falls (2-3-1); every other kind uses one pattern throughout.
 */
export function patternsFor(kind: SentenceKind, groups: number, authored?: PatternId[]): PatternId[] {
  if (authored) return authored;
  const base = patternForKind(kind);
  return Array.from({ length: groups }, (_, i) => ((kind === "list" || kind === "nonfinal") && i === groups - 1 ? "2-3-1" : base));
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
  /**
   * The pattern of each thought group ("2-3-1", "2-3-2" or "2-3"), one per group. Omit to use the kind's default (see
   * `patternsFor`). Author it where the course leaves a choice to the teacher, e.g. whether the last item of a list falls.
   */
  patterns?: PatternId[];
  /** Alias of `patterns` (the tag lessons use this name). */
  groupPatterns?: PatternId[];
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

/**
 * Target levels for the tag of a SURE tag question (3-1): the tag starts HIGH, on the stressed auxiliary, and falls.
 * Syllables before the nucleus (none in the course tags) stay at 3, the nucleus is 3, everything after it is 1.
 * When the nucleus is the last syllable it glides [3, 1] inside the syllable.
 */
export function levelsForFallingTag(syllableCount: number, nucleusIndex: number): number[][] {
  if (!Number.isInteger(syllableCount) || syllableCount < 1) throw new Error(`Bad syllable count ${syllableCount}`);
  if (!Number.isInteger(nucleusIndex) || nucleusIndex < 0 || nucleusIndex >= syllableCount) {
    throw new Error(`Nucleus ${nucleusIndex} is outside 0..${syllableCount - 1}`);
  }
  return Array.from({ length: syllableCount }, (_, i) =>
    i < nucleusIndex ? [3] : i === nucleusIndex ? (i === syllableCount - 1 ? [3, 1] : [3]) : [1],
  );
}

/**
 * Target levels for one NON-FINAL (2-3-2) thought group, one entry per syllable. Start at 2, rise to 3 on the nucleus and
 * come back to 2 (NOT 1: the sentence is not finished):
 *  - before the nucleus: 2
 *  - the nucleus: 3. When it is the last syllable it glides back down inside the syllable: [3, 2]. When it is the first of
 *    several syllables it glides up from 2: [2, 3], so the group still starts at 2.
 *  - after the nucleus: 2
 */
export function levelsForNonFinalGroup(syllableCount: number, nucleusIndex: number): number[][] {
  if (!Number.isInteger(syllableCount) || syllableCount < 1) throw new Error(`Bad syllable count ${syllableCount}`);
  if (!Number.isInteger(nucleusIndex) || nucleusIndex < 0 || nucleusIndex >= syllableCount) {
    throw new Error(`Nucleus ${nucleusIndex} is outside 0..${syllableCount - 1}`);
  }
  const last = syllableCount - 1;
  return Array.from({ length: syllableCount }, (_, i) => {
    if (i < nucleusIndex) return [2];
    if (i === nucleusIndex) return i === last ? [3, 2] : i === 0 ? [2, 3] : [3];
    return [2];
  });
}

/** The levels of one thought group for its pattern. */
export function levelsForPattern(pattern: PatternId, syllableCount: number, nucleusIndex: number): number[][] {
  switch (pattern) {
    case "2-3-1":
      return levelsForGroup(syllableCount, nucleusIndex);
    case "2-3":
      return levelsForRisingGroup(syllableCount, nucleusIndex);
    case "2-3-2":
      return levelsForNonFinalGroup(syllableCount, nucleusIndex);
    case "3-1":
      return levelsForFallingTag(syllableCount, nucleusIndex);
  }
}

const KIND_LABEL: Record<SentenceKind, string> = {
  statement: "Statement",
  wh: "Wh-question",
  command: "Command",
  exclamation: "Exclamation",
  yesno: "Yes/no question",
  address: "Direct address",
  interjection: "Interjection",
  list: "List",
  choice: "Choice question",
  nonfinal: "Non-final thought group",
  tag: "Tag question",
};

/** The `Sentence.kind` labels of sentences with one item per thought group: lists and choices. */
export const LIST_KIND_LABELS: readonly string[] = [KIND_LABEL.list, KIND_LABEL.choice];

/** "TA-", "-RIVE", "-TU-" or "NAME": how the nucleus chunk is written in the hint. */
export function nucleusLabel(chunks: string[], index: number): string {
  const c = chunks[index].toUpperCase();
  if (chunks.length === 1) return c;
  return `${index > 0 ? "-" : ""}${c}${index < chunks.length - 1 ? "-" : ""}`;
}

const joinEn = (l: string[]) => (l.length <= 1 ? (l[0] ?? "") : `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}`);
const joinTh = (l: string[]) => (l.length <= 1 ? (l[0] ?? "") : `${l.slice(0, -1).join(", ")} และ ${l[l.length - 1]}`);

/**
 * `labels` has one entry per thought group (a plain string for a single group). `patterns` (one per group) tells the
 * list note whether the last item falls and the tag note whether the tag falls (3-1) or rises (2-3).
 */
export function noteFor(kind: SentenceKind, labels: string | string[], patterns?: PatternId[]): Bilingual {
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
    case "list": {
      const lastFalls = (patterns ?? ["2-3-1"]).at(-1) === "2-3-1";
      const items = lastFalls ? all.slice(0, -1) : all;
      const end = all[all.length - 1];
      return lastFalls
        ? {
            en: `Each item of a list is its own thought group and RISES (2-3): peaks on ${joinEn(items)}. The last item comes down to finish the statement (2-3-1) on ${end}.`,
            th: `แต่ละรายการในลิสต์เป็นกลุ่มคำของตัวเองและใช้เสียงขึ้น 2-3 ขึ้นที่ ${joinTh(items)} ส่วนรายการสุดท้ายลงเสียงให้จบประโยค 2-3-1 ที่ ${end}`,
          }
        : {
            en: `Each item of a list is its own thought group and RISES (2-3): peaks on ${joinEn(items)}.`,
            th: `แต่ละรายการในลิสต์เป็นกลุ่มคำของตัวเองและใช้เสียงขึ้น 2-3 ขึ้นที่ ${joinTh(items)}`,
          };
    }
    case "choice":
      return {
        en: `Each choice is its own thought group and RISES (2-3), the last one too: peaks on ${joinEn(all)}.`,
        th: `แต่ละตัวเลือกเป็นกลุ่มคำของตัวเองและใช้เสียงขึ้น 2-3 รวมถึงตัวเลือกสุดท้ายด้วย ขึ้นที่ ${joinTh(all)}`,
      };
    case "nonfinal": {
      const open = all.slice(0, -1);
      const end = all[all.length - 1];
      return {
        en: `A part that is not finished rises to 3 and comes back to 2, not 1 (2-3-2): peaks on ${joinEn(open)}. Only the last part falls to 1 (2-3-1) on ${end}.`,
        th: `ส่วนที่ยังพูดไม่จบขึ้นระดับ 3 แล้วกลับมาที่ระดับ 2 ไม่ใช่ 1 (2-3-2) ขึ้นที่ ${joinTh(open)} มีเพียงส่วนสุดท้ายที่ลงระดับ 1 (2-3-1) ที่ ${end}`,
      };
    }
    case "tag": {
      const tag = all[1] ?? label;
      return patterns?.at(-1) === "3-1"
        ? {
            en: `You are SURE and want agreement. The statement is 2-3-1 (peak on ${label}), then the tag falls 3-1: start high on ${tag} and drop to 1.`,
            th: `ถ้ามั่นใจและต้องการให้อีกฝ่ายเห็นด้วย ประโยคแรกใช้ 2-3-1 (ขึ้นสูงที่ ${label}) แล้ว tag ตก 3-1 เริ่มสูงที่ ${tag} แล้วลงต่ำ`,
          }
        : {
            en: `You are NOT sure and really asking. The statement is 2-3-1 (peak on ${label}), then the tag rises 2-3: rise on ${tag} and stay up.`,
            th: `ถ้าไม่แน่ใจและถามจริง ๆ ประโยคแรกใช้ 2-3-1 (ขึ้นสูงที่ ${label}) แล้ว tag ขึ้น 2-3 ขึ้นที่ ${tag} และค้างเสียงสูงไว้`,
          };
    }
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

  const authored = src.patterns ?? src.groupPatterns;
  if (src.kind === "tag" && !authored) throw new Error(`${src.id}: a tag question needs patterns (e.g. ["2-3-1", "3-1"])`);
  const patterns = patternsFor(src.kind, sizes.length, authored);
  if (patterns.length !== sizes.length || patterns.some((p) => p !== "2-3-1" && p !== "2-3-2" && p !== "2-3" && p !== "3-1")) {
    throw new Error(`${src.id}: ${sizes.length} thought group(s) need ${sizes.length} pattern(s) from 2-3-1, 2-3-2, 2-3, 3-1; got [${patterns.join(", ")}]`);
  }
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
    const pattern = patterns[gi];
    const levels = levelsForPattern(pattern, total, flatNucleus);

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
    kind: src.kind === "tag" ? (patterns[patterns.length - 1] === "3-1" ? "Tag question (sure)" : "Tag question (not sure)") : KIND_LABEL[src.kind],
    note: noteFor(src.kind, labels, patterns),
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

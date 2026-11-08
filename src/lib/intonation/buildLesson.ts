// Turn authored lesson sentences (text + nucleus word) into full `Sentence` objects.
// Pure: no fs, no DOM. tools/build-lessons.ts feeds it the CMUdict-based word table and writes the JSON files.
//
// What a human writes: the sentence text, which word carries the nucleus, a kind, and (for words of 2+ syllables)
// how to spell the syllable chunks, e.g. "ta-ble". Everything else is generated: IPA and syllable count come from the
// word table, the nucleus syllable is the dictionary's primary-stress syllable of that word, and the pitch levels
// come from `levelsForGroup`.

import { normalizeWord } from "../ipa/words.ts";
import type { WordIpa } from "../ipa/words.ts";
import type { Bilingual, Sentence, Syllable, Word } from "./types.ts";

export type SentenceKind = "statement" | "wh" | "command" | "exclamation";

export interface SentenceSource {
  /** Stable id; also the name of the reference audio file (`/audio/<id>--f.mp3`). */
  id: string;
  text: string;
  kind: SentenceKind;
  /** Index (0-based, whitespace-separated) of the last content word: the word that carries the peak. */
  nucleusWord: number;
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

const KIND_LABEL: Record<SentenceKind, string> = {
  statement: "Statement",
  wh: "Wh-question",
  command: "Command",
  exclamation: "Exclamation",
};

/** "TA-", "-RIVE", "-TU-" or "NAME": how the nucleus chunk is written in the hint. */
export function nucleusLabel(chunks: string[], index: number): string {
  const c = chunks[index].toUpperCase();
  if (chunks.length === 1) return c;
  return `${index > 0 ? "-" : ""}${c}${index < chunks.length - 1 ? "-" : ""}`;
}

export function noteFor(kind: SentenceKind, label: string): Bilingual {
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

/** Build one falling (2-3-1) sentence with a single thought group. */
export function buildSentence(src: SentenceSource, table: Readonly<Record<string, WordIpa>>): Sentence {
  const rawWords = src.text.trim().split(/\s+/);
  if (!Number.isInteger(src.nucleusWord) || src.nucleusWord < 0 || src.nucleusWord >= rawWords.length) {
    throw new Error(`${src.id}: nucleusWord ${src.nucleusWord} is outside the ${rawWords.length} words of "${src.text}"`);
  }

  const entries = rawWords.map((raw) => {
    const key = normalizeWord(raw);
    const entry = table[key];
    if (!entry) throw new Error(`${src.id}: no IPA for "${key}"`);
    return { raw, key, entry, chunks: chunksFor(raw, key, entry.syllables.length, src.spelling) };
  });

  // Nucleus syllable = primary-stress syllable of the nucleus word (the only syllable of a one-syllable word).
  const nWord = entries[src.nucleusWord];
  const nSyl =
    nWord.entry.syllables.length === 1 ? 0 : nWord.entry.syllables.findIndex((s) => s.stress === 1);
  if (nSyl < 0) throw new Error(`${src.id}: "${nWord.key}" has no primary-stress syllable in the dictionary`);

  // Flat syllable index of the nucleus within the group, for the levels.
  let flatNucleus = 0;
  for (let i = 0; i < src.nucleusWord; i++) flatNucleus += entries[i].entry.syllables.length;
  flatNucleus += nSyl;
  const total = entries.reduce((n, e) => n + e.entry.syllables.length, 0);
  const levels = levelsForGroup(total, flatNucleus);

  let flat = 0;
  const words: Word[] = entries.map((e, wi) => {
    const multi = e.entry.syllables.length > 1;
    const syllables: Syllable[] = e.entry.syllables.map((s, si) => {
      const syl: Syllable = { text: e.chunks[si], ipa: s.ipa, levels: levels[flat++] };
      if ((multi && s.stress === 1) || (wi === src.nucleusWord && si === nSyl)) syl.stressed = true;
      return syl;
    });
    return { text: e.raw, syllables };
  });

  return {
    id: src.id,
    text: src.text,
    kind: KIND_LABEL[src.kind],
    note: noteFor(src.kind, nucleusLabel(nWord.chunks, nSyl)),
    groups: [{ pattern: "2-3-1", words, nucleus: { word: src.nucleusWord, syllable: nSyl } }],
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

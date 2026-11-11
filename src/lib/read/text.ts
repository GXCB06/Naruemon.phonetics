// Read aloud: turning pasted English into sentences and words, IPA for any word, and matching Azure's scored words back to
// ours. Pure: no DOM, no React, no network (the dictionary is passed in).

import { classIpa } from "../ipa/notation.ts";
import type { Override } from "../ipa/words.ts";
import { buildWordIpa, normalizeWord } from "../ipa/words.ts";

/** Longest text taken in one go (characters). Longer text is cut at a sentence end. */
export const MAX_TEXT = 900;
/** A sentence longer than this is shown but not scored: Azure scores about 30 seconds of speech in one go. */
export const MAX_SENTENCE = 260;

export interface SentenceSpan {
  text: string;
  /** Too long to score in one recording. */
  long: boolean;
}

/** Abbreviations whose full stop does not end a sentence. */
const ABBREV = /(?:^|[\s"'(])(?:mr|mrs|ms|dr|prof|st|jr|sr|vs|etc|no|e\.g|i\.e|a\.m|p\.m)\.$/i;
/** "J." in "J. Smith". */
const INITIAL = /(?:^|[\s"'(])[A-Z]\.$/;

/**
 * Split text into sentences at . ! ? (also after a closing quote or bracket), at line breaks, and never inside an
 * abbreviation ("Mr. Smith"), an initial ("J. Smith"), or a decimal. Whitespace is collapsed. Empty pieces are dropped.
 */
export function splitSentences(input: string): SentenceSpan[] {
  const out: string[] = [];
  for (const para of input.replace(/\r/g, "").split(/\n+/)) {
    const text = para.replace(/\s+/g, " ").trim();
    if (!text) continue;
    let start = 0;
    const re = /[.!?]+["')\]”’]*(?=\s|$)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const end = m.index + m[0].length;
      const before = text.slice(start, m.index + 1); // up to and including the first terminal mark
      const rest = text.slice(end).trimStart();
      const terminal = m[0][0];
      const notEnd = terminal === "." && (ABBREV.test(before) || INITIAL.test(before) || (/^[a-z]/.test(rest) && !/[!?]/.test(m[0])));
      if (notEnd) continue;
      out.push(text.slice(start, end).trim());
      start = end;
    }
    if (start < text.length) out.push(text.slice(start).trim());
  }
  return out.filter((s) => /[\p{L}\p{N}]/u.test(s)).map((text) => ({ text, long: text.length > MAX_SENTENCE }));
}

/** Sentences of a text, cut so that the total stays within MAX_TEXT. `truncated` says some were left out. */
export function readableSentences(input: string): { sentences: SentenceSpan[]; truncated: boolean } {
  const all = splitSentences(input);
  const sentences: SentenceSpan[] = [];
  let total = 0;
  for (const s of all) {
    if (sentences.length > 0 && total + s.text.length > MAX_TEXT) return { sentences, truncated: true };
    sentences.push(s);
    total += s.text.length + 1;
  }
  return { sentences, truncated: false };
}

export interface Token {
  /** The word as written, without surrounding punctuation ("isn't", "well-known"). */
  text: string;
  /** Lower-case dictionary key. */
  key: string;
  /** Character offsets of `text` inside the sentence. */
  start: number;
  end: number;
}

/** The words of a sentence with where each one sits in the text (for highlighting while it is read aloud). */
export function tokenize(sentence: string): Token[] {
  const out: Token[] = [];
  const re = /[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sentence))) {
    out.push({ text: m[0], key: normalizeWord(m[0].replace(/’/g, "'")), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** The index of the word being spoken when the speech engine reports a character position (-1 before the first word). */
export function wordAtChar(tokens: readonly Token[], charIndex: number): number {
  let found = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].start <= charIndex) found = i;
    else break;
  }
  return found;
}

// ---------------------------------------------------------------------------------------------------------------
// IPA of any word
// ---------------------------------------------------------------------------------------------------------------

export interface WordIpaEntry {
  /** The class's notation with stress marks ("ˈmɔrnɪŋ"), or null for a word the dictionary does not have. */
  ipa: string | null;
}

/** IPA for each distinct word key, in the class notation (r, not ɹ). Words the dictionary lacks (names, numbers) get null. */
export function ipaForKeys(
  keys: readonly string[],
  dictionary: Readonly<Record<string, string>>,
  overrides: Readonly<Record<string, Override>>,
): Record<string, WordIpaEntry> {
  const out: Record<string, WordIpaEntry> = {};
  for (const key of keys) {
    if (!key || Object.hasOwn(out, key)) continue;
    try {
      // the class writes /ˈæktər/, not /ˈæk.tər/: no syllable dots
      out[key] = { ipa: classIpa(buildWordIpa(key, dictionary, overrides).ipa).replace(/\./g, "") };
    } catch {
      out[key] = { ipa: null };
    }
  }
  return out;
}

/** The distinct keys of some text, capped, for asking the server for IPA. */
export function distinctKeys(text: string, max = 200): string[] {
  const keys: string[] = [];
  for (const t of tokenize(text)) if (t.key && !keys.includes(t.key) && keys.length < max) keys.push(t.key);
  return keys;
}

// ---------------------------------------------------------------------------------------------------------------
// Matching Azure's scored words to ours
// ---------------------------------------------------------------------------------------------------------------

/**
 * For each of our words, the index of the Azure word that scored it (or null: Azure heard no such word, so it was left out).
 * Both lists are in spoken order, so each of our words is matched to the next Azure word with the same spelling, and a word
 * Azure inserted (said but not in the text) is skipped. A word never matches backwards.
 */
export function matchWords(tokens: readonly Token[], azureWords: readonly { word: string }[]): (number | null)[] {
  const norm = (w: string) => normalizeWord(w.replace(/’/g, "'"));
  const azure = azureWords.map((w) => norm(w.word));
  let from = 0;
  return tokens.map((t) => {
    for (let j = from; j < azure.length; j++) {
      if (azure[j] === t.key) {
        from = j + 1;
        return j;
      }
    }
    return null;
  });
}

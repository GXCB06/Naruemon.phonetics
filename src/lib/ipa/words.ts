// Word-level IPA entries: CMUdict (or a manual override) -> syllables with IPA and stress.
// Pure module (no DOM, no React, no fs); tools/build-ipa.ts feeds it the dictionary.

import { formatSyllables, parseArpabet } from "./arpabet.ts";
import type { Stress } from "./arpabet.ts";
import { syllabify } from "./syllabify.ts";

export interface WordSyllableIpa {
  /** IPA of this syllable, no stress mark, e.g. "prɪ". */
  ipa: string;
  /** Lexical stress from the dictionary: 0 none, 1 primary, 2 secondary. */
  stress: Stress;
}

export interface WordIpa {
  /** ARPAbet actually used (dictionary entry or override), e.g. "P R IH1 T IY0". */
  arpabet: string;
  syllables: WordSyllableIpa[];
  /** Display form with stress marks, e.g. "ˈprɪ.ti" (no mark on monosyllables). */
  ipa: string;
  /** Where the pronunciation came from. */
  source: "cmudict" | "override";
}

export interface Override {
  arpabet: string;
  /** Why the dictionary entry is not used. Kept next to the data so the difference is documented. */
  reason: string;
}

/** Lowercase, strip surrounding punctuation, keep inner apostrophes: "isn't," -> "isn't". */
export function normalizeWord(text: string): string {
  return text
    .toLowerCase()
    .replace(/^[^a-z']+|[^a-z']+$/g, "")
    .replace(/^'+|'+$/g, "");
}

/** Unique normalised words of a sentence, in order of first appearance. */
export function wordsOfSentence(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\s+/)) {
    const w = normalizeWord(raw);
    if (w && !out.includes(w)) out.push(w);
  }
  return out;
}

/**
 * Build the entry for one word. Overrides win over the dictionary. A word that is in neither throws:
 * we never guess a pronunciation (add it to OVERRIDES in src/lib/ipa/overrides.ts).
 */
export function buildWordIpa(
  word: string,
  dictionary: Readonly<Record<string, string>>,
  overrides: Readonly<Record<string, Override>>,
): WordIpa {
  const override = overrides[word];
  const arpabet = override?.arpabet ?? dictionary[word];
  if (arpabet === undefined) {
    throw new Error(
      `"${word}" is not in CMUdict and has no override. Add it to OVERRIDES in src/lib/ipa/overrides.ts ` +
        `with an ARPAbet pronunciation (stress digits 0/1/2); the build never guesses.`,
    );
  }
  const syllables = syllabify(parseArpabet(arpabet)).map((s) => ({ ipa: s.ipa, stress: s.stress }));
  return {
    arpabet,
    syllables,
    ipa: formatSyllables(
      syllables.map((s) => s.ipa),
      syllables.map((s) => s.stress),
    ),
    source: override ? "override" : "cmudict",
  };
}

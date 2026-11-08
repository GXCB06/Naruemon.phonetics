// Own maximal-onset syllabifier for ARPAbet phone lists (written from scratch; no third-party code).
//
// Algorithm: every vowel is a syllable nucleus. The consonants between two nuclei are split by the Maximal Onset
// Principle: the second syllable takes the longest suffix of the cluster that is a legal English onset, and whatever
// is left over is the coda of the first syllable. Word-initial clusters are all onset, word-final clusters all coda.
// Limitation: purely phonotactic, so it does not see morpheme boundaries; a word where that matters goes in the
// OVERRIDES table of tools/build-ipa.ts.

import { isVowel, parsePhone, phonesToIpa } from "./arpabet.ts";
import type { ArpaPhone, Stress } from "./arpabet.ts";

/** Legal two-consonant onsets: obstruent + liquid/glide, and s + consonant. */
const TWO_CONSONANT_ONSETS: ReadonlySet<string> = new Set([
  // stop/fricative + l
  "P L", "B L", "K L", "G L", "F L", "S L",
  // stop/fricative + r
  "P R", "B R", "T R", "D R", "K R", "G R", "F R", "TH R", "SH R",
  // stop/fricative + w
  "T W", "D W", "K W", "G W", "TH W", "S W",
  // consonant + y (cute, music, few, view, thew, new, lieu, huge)
  "P Y", "B Y", "T Y", "D Y", "K Y", "G Y", "F Y", "V Y", "TH Y", "S Y", "Z Y", "M Y", "N Y", "L Y", "HH Y",
  // s + stop/nasal
  "S P", "S T", "S K", "S M", "S N",
]);

/** Legal three-consonant onsets: s + p/t/k + l/r/w/y (spl spr str skr skw sky ...). */
const THREE_CONSONANT_ONSETS: ReadonlySet<string> = new Set([
  "S P L", "S P R", "S P Y",
  "S T R", "S T Y",
  "S K L", "S K R", "S K W", "S K Y",
]);

/** Is this phone list (no stress digits) a legal English word onset? Length 0 and 1 are always fine, except NG. */
export function isLegalOnset(cluster: readonly string[]): boolean {
  if (cluster.length === 0) return true;
  if (cluster.length === 1) return cluster[0] !== "NG";
  if (cluster.length === 2) return TWO_CONSONANT_ONSETS.has(cluster.join(" "));
  if (cluster.length === 3) return THREE_CONSONANT_ONSETS.has(cluster.join(" "));
  return false;
}

export interface Syllable {
  phones: ArpaPhone[];
  /** Stress of the syllable's vowel: 0 none, 1 primary, 2 secondary. */
  stress: Stress;
  /** IPA without stress mark. */
  ipa: string;
}

/** Split phones into syllables by maximal onset. Throws if there is no vowel at all. */
export function syllabify(phones: readonly ArpaPhone[]): Syllable[] {
  const nuclei: number[] = [];
  phones.forEach((p, i) => {
    if (isVowel(p.phone)) nuclei.push(i);
  });
  if (nuclei.length === 0) throw new Error("Cannot syllabify a word with no vowel");

  // starts[k] = index of the first phone of syllable k; the last entry is the end of the word.
  const starts: number[] = [0];
  for (let k = 1; k < nuclei.length; k++) {
    const from = nuclei[k - 1] + 1;
    const to = nuclei[k]; // the consonant cluster is phones[from..to)
    let split = to;
    // Try the longest onset first (smallest start index); a single consonant is always legal except NG.
    for (let s = from; s < to; s++) {
      if (isLegalOnset(phones.slice(s, to).map((p) => p.phone))) {
        split = s;
        break;
      }
    }
    starts.push(split);
  }
  starts.push(phones.length);

  return nuclei.map((n, k) => {
    const slice = phones.slice(starts[k], starts[k + 1]);
    return { phones: slice, stress: (phones[n].stress ?? 0) as Stress, ipa: phonesToIpa(slice) };
  });
}

/** Convenience: ARPAbet string (e.g. "P R IH1 T IY0") -> syllables. */
export function syllabifyArpabet(text: string): Syllable[] {
  return syllabify(text.trim().split(/\s+/).filter(Boolean).map(parsePhone));
}

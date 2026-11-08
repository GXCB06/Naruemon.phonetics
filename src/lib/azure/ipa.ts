// IPA layer for Azure pronunciation results (task B4). Pure: no DOM, no React, no SDK.
//
// What lives here:
//  1. normalizeIpa(): one symbol set. Azure's IPA symbols are mapped to the set our generated lessons use
//     (src/lib/ipa/arpabet.ts: ɹ for r, ɡ for g, ɚ/ɝ, tʃ/dʒ and eɪ/oʊ as two symbols), so a learner never sees a false
//     "error" that is only a spelling difference between two IPA conventions. The table below is the full list.
//  2. bandOf(): the accuracy bands the UI draws (good / okay / needs work).
//  3. wordViews(): per word, per phoneme: expected IPA (what Azure expected) vs spoken IPA (the best n-best candidate).
//  4. findFinalConsonantIssues(): flags dropped or very weak FINAL consonants, a typical Thai-learner problem
//     (Thai has few final consonants and unreleased stops, so "want" often comes out as "wan" or "wa").
//
// Everything user-facing is bilingual { en, th }.

import type { AzureAssessment, AzurePhoneme, AzureWord } from "./parse.ts";

export interface Bilingual {
  en: string;
  th: string;
}

// ---------------------------------------------------------------------------
// 1. Symbol normalisation
// ---------------------------------------------------------------------------

export interface IpaMapping {
  /** Symbol (or sequence) as Azure or another IPA convention may write it. */
  from: string;
  /** Symbol our lessons use. Empty string = the mark is dropped. */
  to: string;
  why: string;
  /** True when this exact symbol appears in the two recorded fixtures (src/lib/azure/__fixtures__). */
  inFixtures: boolean;
  /** Only match when NOT followed by this character (used for "e" vs "eɪ"). */
  notBefore?: string;
}

/**
 * Every mapping from an Azure-side IPA symbol to the lesson symbol set. Checked against the fixtures: only "g" occurs
 * there (as a candidate in the n-best lists); the fixtures use no ɹ, ɚ or ɝ at all, so the other rows are defensive:
 * Microsoft's own en-US IPA table and other IPA conventions use these variants, and nothing here has been verified
 * against a real Azure response yet. Rows are applied longest-first.
 *
 * The lesson set itself (not mapped, passed through): vowels ɑ æ ʌ ɔ ɛ ɪ i ʊ u ə ɚ ɝ, diphthongs aɪ aʊ eɪ oʊ ɔɪ,
 * consonants b d f ɡ h j k l m n ŋ p ɹ s ʃ t θ ð v w z ʒ, affricates tʃ dʒ.
 */
export const IPA_MAPPINGS: readonly IpaMapping[] = [
  { from: "g", to: "ɡ", why: "Plain Latin g (U+0067) vs the IPA script g our lessons use (U+0261).", inFixtures: true },
  { from: "r", to: "ɹ", why: "Many IPA tables write the English r as r; lessons use ɹ (the approximant).", inFixtures: false },
  { from: "ɻ", to: "ɹ", why: "Retroflex approximant: another way of writing the American r.", inFixtures: false },
  { from: "ɫ", to: "l", why: "Dark (velarised) l is still the phoneme /l/.", inFixtures: false },
  { from: "t͡ʃ", to: "tʃ", why: "Affricate written with a tie bar; lessons use two symbols.", inFixtures: false },
  { from: "t͜ʃ", to: "tʃ", why: "Same, tie bar below.", inFixtures: false },
  { from: "d͡ʒ", to: "dʒ", why: "Affricate written with a tie bar; lessons use two symbols.", inFixtures: false },
  { from: "d͜ʒ", to: "dʒ", why: "Same, tie bar below.", inFixtures: false },
  { from: "ʧ", to: "tʃ", why: "Ligature for the affricate.", inFixtures: false },
  { from: "ʤ", to: "dʒ", why: "Ligature for the affricate.", inFixtures: false },
  { from: "ɜ˞", to: "ɝ", why: "r-coloured stressed vowel written as ɜ plus the rhotic hook.", inFixtures: false },
  { from: "ɝ", to: "ɝ", why: "Already the lesson symbol (ER1/ER2). Listed so the table shows the full r-coloured set.", inFixtures: false },
  { from: "ɜ", to: "ɝ", why: "Non-rhotic spelling of the stressed r-coloured vowel; American English is rhotic.", inFixtures: false },
  { from: "ə˞", to: "ɚ", why: "r-coloured schwa written as ə plus the rhotic hook.", inFixtures: false },
  { from: "ɹ̩", to: "ɚ", why: "Syllabic ɹ is the r-coloured schwa.", inFixtures: false },
  { from: "ɚ", to: "ɚ", why: "Already the lesson symbol (ER0). Listed so the table shows the full r-coloured set.", inFixtures: false },
  { from: "e", to: "eɪ", why: "Bare e stands for the FACE vowel in some tables; lessons write the diphthong eɪ.", inFixtures: false, notBefore: "ɪ" },
  { from: "o", to: "oʊ", why: "Bare o stands for the GOAT vowel in some tables; lessons write the diphthong oʊ.", inFixtures: false, notBefore: "ʊ" },
  { from: "ɒ", to: "ɑ", why: "Rounded open vowel merges with ɑ in American English.", inFixtures: false },
  { from: "ɐ", to: "ʌ", why: "Near-open central vowel is the STRUT vowel ʌ in American transcription.", inFixtures: false },
  { from: "ɨ", to: "ɪ", why: "Close central vowel used for unstressed ɪ in some tables.", inFixtures: false },
  { from: "ᵻ", to: "ɪ", why: "Unstressed ɪ/ə mark used by some dictionaries; lessons keep ɪ.", inFixtures: false },
  { from: "ɵ", to: "ə", why: "Rounded schwa variant.", inFixtures: false },
  { from: "ʉ", to: "u", why: "Fronted u (as in GOOSE) is still /u/.", inFixtures: false },
  { from: "ˈ", to: "", why: "Stress marks are not part of a phone; lessons put them before the syllable when displayed.", inFixtures: false },
  { from: "ˌ", to: "", why: "Secondary stress mark, same reason.", inFixtures: false },
  { from: "ː", to: "", why: "Length mark: length is not a separate phoneme in our set.", inFixtures: false },
  { from: "ʰ", to: "", why: "Aspiration mark: /p t k/ are one phoneme each in our set.", inFixtures: false },
  { from: ".", to: "", why: "Syllable boundary dot.", inFixtures: false },
];

const ALTERNATION = [...IPA_MAPPINGS].sort((a, b) => b.from.length - a.from.length);
const BY_FROM = new Map(ALTERNATION.map((m) => [m.from, m] as const));
const ESCAPE = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NORMALIZE_RE = new RegExp(ALTERNATION.map((m) => ESCAPE(m.from)).join("|"), "gu");

/** Azure IPA (or any of the variants in IPA_MAPPINGS) to the lesson symbol set. Unknown symbols pass through unchanged. */
export function normalizeIpa(ipa: string): string {
  return ipa
    .normalize("NFC")
    .replace(NORMALIZE_RE, (m, offset: number, whole: string) => {
      const row = BY_FROM.get(m);
      if (!row) return m;
      if (row.notBefore && whole[offset + m.length] === row.notBefore) return m;
      return row.to;
    });
}

const VOWEL_START = /^(?:aɪ|aʊ|eɪ|oʊ|ɔɪ|[ɑæʌɔɛɪiʊuəɚɝ])/u;

/** True for a vowel or diphthong in the lesson symbol set (input is normalised first). */
export function isVowelIpa(ipa: string): boolean {
  return VOWEL_START.test(normalizeIpa(ipa));
}

// ---------------------------------------------------------------------------
// 2. Accuracy bands
// ---------------------------------------------------------------------------

export type Band = "good" | "ok" | "poor" | "unknown";

/** Accuracy at or above this is "clear". */
export const BAND_GOOD = 80;
/** Accuracy at or above this (and below BAND_GOOD) is "okay". Below it a sound needs work. */
export const BAND_OK = 60;

export function bandOf(accuracy: number | null): Band {
  if (accuracy === null) return "unknown";
  return accuracy >= BAND_GOOD ? "good" : accuracy >= BAND_OK ? "ok" : "poor";
}

// ---------------------------------------------------------------------------
// 3. Expected vs spoken
// ---------------------------------------------------------------------------

export interface PhonemeView {
  /** The sound Azure expected here (reference pronunciation), normalised. */
  expected: string;
  /** The best candidate Azure heard (top of the n-best list), normalised; null when Azure gave no candidates and the score is low. */
  spoken: string | null;
  /** Score of the spoken candidate, if known. */
  spokenScore: number | null;
  accuracy: number | null;
  band: Band;
  /** spoken equals expected (after normalisation). */
  matches: boolean;
  isConsonant: boolean;
  isFinal: boolean;
}

export interface WordView {
  index: number;
  word: string;
  accuracy: number | null;
  band: Band;
  errorType: string;
  /** Expected pronunciation, e.g. "pɛn". */
  expectedIpa: string;
  /** What was heard, e.g. "pɛə". Phonemes with no candidate and a low score show as "?". */
  spokenIpa: string;
  phonemes: PhonemeView[];
  /** Final-consonant problems in this word (usually 0 or 1). */
  finalIssues: FinalConsonantIssue[];
}

function bestCandidate(p: AzurePhoneme): { ipa: string; score: number } | null {
  let best: { ipa: string; score: number } | null = null;
  for (const n of p.nbest) {
    if (n.ipa === "") continue;
    if (best === null || n.score > best.score) best = n;
  }
  return best;
}

function phonemeView(p: AzurePhoneme, isFinal: boolean): PhonemeView {
  const expected = normalizeIpa(p.ipa);
  const best = bestCandidate(p);
  let spoken: string | null;
  let spokenScore: number | null;
  if (best) {
    spoken = normalizeIpa(best.ipa);
    spokenScore = best.score;
  } else if (p.accuracy !== null && p.accuracy >= BAND_OK) {
    spoken = expected; // no candidates sent, but Azure scored the expected sound as acceptable
    spokenScore = p.accuracy;
  } else {
    spoken = null;
    spokenScore = null;
  }
  return {
    expected,
    spoken,
    spokenScore,
    accuracy: p.accuracy,
    band: bandOf(p.accuracy),
    matches: spoken === expected,
    isConsonant: !isVowelIpa(expected),
    isFinal,
  };
}

export function wordViews(assessment: AzureAssessment): WordView[] {
  return assessment.words.map((w, index) => {
    const phonemes = w.phonemes.map((p, i) => phonemeView(p, i === w.phonemes.length - 1));
    const finalIssue = finalConsonantIssue(w, index);
    return {
      index,
      word: w.word,
      accuracy: w.accuracy,
      band: bandOf(w.accuracy),
      errorType: w.errorType,
      expectedIpa: phonemes.map((p) => p.expected).join(""),
      spokenIpa: phonemes.map((p) => p.spoken ?? "?").join(""),
      phonemes,
      finalIssues: finalIssue ? [finalIssue] : [],
    };
  });
}

// ---------------------------------------------------------------------------
// 4. Dropped or very weak final consonants
// ---------------------------------------------------------------------------

/** A final consonant scoring at or below this was effectively not said. */
export const FINAL_DROPPED_MAX = 20;
/** A final consonant scoring below this was said, but very weakly. */
export const FINAL_WEAK_MAX = 50;

export interface FinalConsonantIssue {
  wordIndex: number;
  word: string;
  /** The consonant that should end the word, normalised (e.g. "t"). */
  phoneme: string;
  kind: "dropped" | "weak";
  accuracy: number;
  /** What Azure heard in its place (best n-best candidate), if it differs from the expected sound. */
  heardAs: string | null;
  message: Bilingual;
}

export function finalConsonantMessage(word: string, phoneme: string, kind: "dropped" | "weak"): Bilingual {
  const w = word.replace(/[^\p{L}'’-]/gu, "");
  return kind === "dropped"
    ? {
        en: `You didn't pronounce the final /${phoneme}/ in “${w}”. Say the last sound too, even if it is quiet.`,
        th: `คุณไม่ได้ออกเสียง /${phoneme}/ ตัวท้ายของคำว่า “${w}” ให้ออกเสียงตัวสุดท้ายด้วย แม้จะเบาก็ตาม`,
      }
    : {
        en: `The final /${phoneme}/ in “${w}” was very weak. Say it a little clearer.`,
        th: `เสียง /${phoneme}/ ตัวท้ายของคำว่า “${w}” เบามาก ลองออกเสียงให้ชัดขึ้นอีกนิด`,
      };
}

function finalConsonantIssue(w: AzureWord, wordIndex: number): FinalConsonantIssue | null {
  if (w.phonemes.length < 2) return null; // a lone consonant is not a "final" consonant
  const last = w.phonemes[w.phonemes.length - 1];
  if (last.accuracy === null) return null;
  const expected = normalizeIpa(last.ipa);
  if (expected === "" || isVowelIpa(expected)) return null;
  if (last.accuracy >= FINAL_WEAK_MAX) return null;
  const kind = last.accuracy <= FINAL_DROPPED_MAX ? "dropped" : "weak";
  const best = bestCandidate(last);
  const heard = best ? normalizeIpa(best.ipa) : null;
  return {
    wordIndex,
    word: w.word,
    phoneme: expected,
    kind,
    accuracy: last.accuracy,
    heardAs: heard !== null && heard !== expected ? heard : null,
    message: finalConsonantMessage(w.word, expected, kind),
  };
}

/** All dropped or very weak final consonants in the take, in word order. */
export function findFinalConsonantIssues(assessment: AzureAssessment): FinalConsonantIssue[] {
  const out: FinalConsonantIssue[] = [];
  assessment.words.forEach((w, i) => {
    const issue = finalConsonantIssue(w, i);
    if (issue) out.push(issue);
  });
  return out;
}

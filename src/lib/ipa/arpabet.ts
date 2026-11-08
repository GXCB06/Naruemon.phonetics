// ARPAbet (CMUdict) -> US English IPA.
//
// Symbol set (kept consistent with what Azure pronunciation assessment returns for en-US):
//   - r is written ɹ (not r); the r-coloured schwa is ɚ and the stressed r-coloured vowel ER1/ER2 is ɝ.
//   - affricates are two symbols (tʃ, dʒ); diphthongs are two symbols (eɪ aɪ ɔɪ aʊ oʊ).
//   - AH0 (unstressed) is ə, AH1/AH2 (stressed) is ʌ. IH0 stays ɪ, UW0 stays u, IY0 stays i
//     (no ᵻ and no happY-tensing marks), g is the single-storey ɡ.
//   - Stress marks are NOT part of a phone: they go before the stressed syllable when displayed
//     (ˈ primary, ˌ secondary), see `formatSyllables`.
//
// Pure module: no DOM, no React. Imports use explicit .ts extensions (Node runs tools/*.ts directly).

export type Stress = 0 | 1 | 2;

export interface ArpaPhone {
  /** Base phone without the stress digit, e.g. "AH". */
  phone: string;
  /** Stress digit for vowels; undefined for consonants. */
  stress?: Stress;
}

/** The 39 ARPAbet phones: 15 vowels (carry a stress digit in CMUdict) and 24 consonants. */
export const ARPABET_TO_IPA: Readonly<Record<string, string>> = {
  // vowels
  AA: "ɑ",
  AE: "æ",
  AH: "ʌ", // stressed; unstressed AH0 -> ə (see arpaToIpa)
  AO: "ɔ",
  AW: "aʊ",
  AY: "aɪ",
  EH: "ɛ",
  ER: "ɝ", // stressed; unstressed ER0 -> ɚ (see arpaToIpa)
  EY: "eɪ",
  IH: "ɪ",
  IY: "i",
  OW: "oʊ",
  OY: "ɔɪ",
  UH: "ʊ",
  UW: "u",
  // consonants
  B: "b",
  CH: "tʃ",
  D: "d",
  DH: "ð",
  F: "f",
  G: "ɡ",
  HH: "h",
  JH: "dʒ",
  K: "k",
  L: "l",
  M: "m",
  N: "n",
  NG: "ŋ",
  P: "p",
  R: "ɹ",
  S: "s",
  SH: "ʃ",
  T: "t",
  TH: "θ",
  V: "v",
  W: "w",
  Y: "j",
  Z: "z",
  ZH: "ʒ",
};

export const VOWELS: ReadonlySet<string> = new Set([
  "AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW",
]);

export function isVowel(phone: string): boolean {
  return VOWELS.has(phone);
}

/** Parse one ARPAbet token like "AH0" or "NG". Throws on unknown phones (never guess). */
export function parsePhone(token: string): ArpaPhone {
  const m = /^([A-Z]+)([012])?$/.exec(token);
  if (!m || !(m[1] in ARPABET_TO_IPA)) throw new Error(`Unknown ARPAbet phone "${token}"`);
  const phone = m[1];
  if (isVowel(phone)) {
    if (m[2] === undefined) throw new Error(`Vowel "${token}" is missing its stress digit`);
    return { phone, stress: Number(m[2]) as Stress };
  }
  if (m[2] !== undefined) throw new Error(`Consonant "${token}" must not have a stress digit`);
  return { phone };
}

export function parseArpabet(text: string): ArpaPhone[] {
  return text.trim().split(/\s+/).filter(Boolean).map(parsePhone);
}

/** IPA for one parsed phone (no stress mark). */
export function arpaToIpa(p: ArpaPhone): string {
  if (p.phone === "AH" && p.stress === 0) return "ə";
  if (p.phone === "ER" && p.stress === 0) return "ɚ";
  return ARPABET_TO_IPA[p.phone];
}

/** IPA for a run of phones, without stress marks. */
export function phonesToIpa(phones: readonly ArpaPhone[]): string {
  return phones.map(arpaToIpa).join("");
}

/**
 * Display form of a word's syllables: stress mark before the stressed syllable, dots between syllables.
 * Monosyllables get no mark. Example: ["prɪ", "ti"] with stress [1, 0] -> "ˈprɪ.ti".
 */
export function formatSyllables(ipa: readonly string[], stress: readonly Stress[]): string {
  const mark = (s: Stress | undefined) => (s === 1 ? "ˈ" : s === 2 ? "ˌ" : "");
  return ipa.map((s, i) => (ipa.length > 1 ? mark(stress[i]) : "") + s).join(".");
}

// Read aloud: Azure's word-by-word pronunciation scores, shown on OUR words. Pure: no DOM, no network.

import { bandOf, wordViews, type Band, type FinalConsonantIssue, type PhonemeView } from "../azure/ipa.ts";
import type { AzureAssessment } from "../azure/parse.ts";
import { classIpa } from "../ipa/notation.ts";
import type { Bilingual } from "../intonation/types.ts";
import { matchWords, type Token } from "./text.ts";

export type WordBand = Band | "omitted";

export interface WordScore {
  tokenIndex: number;
  /** good / ok / poor from Azure's accuracy, "unknown" when it gave none, "omitted" when no such word was heard. */
  band: WordBand;
  accuracy: number | null;
  /** The sounds expected and what was heard, in the class notation. Null when the word was not heard. */
  expectedIpa: string | null;
  spokenIpa: string | null;
  /** The sounds that were not what they should be (a sound Azure expected and the one it heard instead). */
  mismatches: { expected: string; spoken: string | null }[];
  final: FinalConsonantIssue | null;
}

export interface Fix {
  tokenIndex: number;
  word: string;
  band: WordBand;
  message: Bilingual;
  expectedIpa: string | null;
  spokenIpa: string | null;
}

export interface ReadReport {
  words: WordScore[];
  overall: number | null;
  accuracy: number | null;
  fluency: number | null;
  completeness: number | null;
  prosody: number | null;
  monotone: boolean;
  fixes: Fix[];
}

const round = (n: number | null) => (n === null ? null : Math.round(n));
const slash = (ipa: string) => `/${ipa}/`;

function mismatchesOf(phonemes: readonly PhonemeView[]): WordScore["mismatches"] {
  return phonemes
    .filter((p) => p.band !== "good" && (p.spoken === null || !p.matches))
    .map((p) => ({ expected: classIpa(p.expected), spoken: p.spoken === null ? null : classIpa(p.spoken) }));
}

function fixMessage(word: string, s: WordScore): Bilingual {
  if (s.band === "omitted") return { en: `I didn't hear “${word}”. Say every word.`, th: `ไม่ได้ยินคำว่า “${word}” ลองพูดให้ครบทุกคำ` };
  if (s.final) return { en: s.final.message.en, th: s.final.message.th };
  const m = s.mismatches.find((x) => x.spoken !== null) ?? s.mismatches[0];
  if (m && m.spoken) {
    return {
      en: `In “${word}”, ${slash(m.expected)} sounded like ${slash(m.spoken)}.`,
      th: `ในคำว่า “${word}” เสียง ${slash(m.expected)} ฟังเหมือน ${slash(m.spoken)}`,
    };
  }
  if (m) return { en: `In “${word}”, the ${slash(m.expected)} sound was not clear.`, th: `ในคำว่า “${word}” เสียง ${slash(m.expected)} ไม่ชัด` };
  return { en: `“${word}” needs a clearer sound.`, th: `คำว่า “${word}” ควรออกเสียงให้ชัดขึ้น` };
}

/** The most words shown under "Sounds to fix". */
export const MAX_FIXES = 5;

/**
 * Put Azure's scores on the sentence's own words. Each of our words takes the next Azure word with the same spelling; a
 * word Azure did not hear is "omitted". `fixes` lists the weakest words first (omitted, then poor, then okay), at most MAX_FIXES.
 */
export function readReport(tokens: readonly Token[], assessment: AzureAssessment): ReadReport {
  const views = wordViews(assessment);
  const matched = matchWords(tokens, assessment.words);
  const words: WordScore[] = tokens.map((_, tokenIndex) => {
    const j = matched[tokenIndex];
    if (j === null) return { tokenIndex, band: "omitted", accuracy: null, expectedIpa: null, spokenIpa: null, mismatches: [], final: null };
    const v = views[j];
    return {
      tokenIndex,
      band: v.band,
      accuracy: v.accuracy,
      expectedIpa: v.expectedIpa ? classIpa(v.expectedIpa) : null,
      spokenIpa: v.spokenIpa ? classIpa(v.spokenIpa) : null,
      mismatches: mismatchesOf(v.phonemes),
      final: v.finalIssues[0] ?? null,
    };
  });
  const rank = (b: WordBand) => (b === "omitted" ? 0 : b === "poor" ? 1 : b === "ok" ? 2 : 9);
  const fixes = words
    .filter((w) => w.band === "omitted" || w.band === "poor" || w.band === "ok")
    .sort((a, b) => rank(a.band) - rank(b.band) || (a.accuracy ?? 0) - (b.accuracy ?? 0) || a.tokenIndex - b.tokenIndex)
    .slice(0, MAX_FIXES)
    .map((w) => ({ tokenIndex: w.tokenIndex, word: tokens[w.tokenIndex].text, band: w.band, message: fixMessage(tokens[w.tokenIndex].text, w), expectedIpa: w.expectedIpa, spokenIpa: w.spokenIpa }));
  return {
    words,
    overall: round(assessment.pronScore),
    accuracy: round(assessment.accuracy),
    fluency: round(assessment.fluency),
    completeness: round(assessment.completeness),
    prosody: round(assessment.prosodyScore),
    monotone: assessment.monotone,
    fixes,
  };
}

/** A friendly word for the overall score. */
export function overallWord(score: number | null): Bilingual {
  if (score === null) return { en: "Scored", th: "ให้คะแนนแล้ว" };
  return score >= 85 ? { en: "Clear and natural!", th: "ชัดและเป็นธรรมชาติ!" } : score >= 70 ? { en: "Good, a few sounds to fix", th: "ดี มีไม่กี่เสียงที่ควรแก้" } : score >= 50 ? { en: "Getting there", th: "ใกล้แล้ว" } : { en: "Let's practise this one", th: "มาฝึกประโยคนี้กัน" };
}

export { bandOf };

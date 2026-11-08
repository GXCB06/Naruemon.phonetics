// Turns the JSON that Azure's pronunciation assessment returns into a small typed shape. Pure (no DOM, no SDK).
//
// Azure offsets/durations are 100-nanosecond ticks. Every field is optional in practice (prosody fields only appear
// when prosody assessment is on, syllables only for en-US, Feedback only for some responses), so nothing here throws
// on a missing field; scores that are absent come back as `null`.
//
// Note vs. SPEC.md: the Speech SDK spells the config key `nbestPhonemeCount` (lowercase b) and `enableProsodyAssessment`
// is a setter on the config object, not a JSON field; see assess.ts. The shape of the Feedback block (Prosody.Break /
// Prosody.Intonation) is taken from Microsoft's result-properties table; the docs page has no full JSON sample of it,
// so we look for it both on word.PronunciationAssessment and directly on the word.

export interface AzureNBest {
  ipa: string;
  score: number;
}

export interface AzurePhoneme {
  ipa: string;
  accuracy: number | null;
  nbest: AzureNBest[];
  offsetSec: number | null;
  durationSec: number | null;
}

export interface AzureSyllable {
  /** IPA when the request used phonemeAlphabet "IPA". */
  ipa: string;
  grapheme: string | null;
  offsetSec: number;
  durationSec: number;
  accuracy: number | null;
}

export interface AzureWord {
  word: string;
  offsetSec: number;
  durationSec: number;
  accuracy: number | null;
  /** "None", "Mispronunciation", "Omission", "Insertion", "UnexpectedBreak", "MissingBreak" or "Monotone", as Azure sends it. */
  errorType: string;
  syllables: AzureSyllable[];
  phonemes: AzurePhoneme[];
}

export interface AzureBreak {
  /** Index into `words`: the break is after this word. */
  wordIndex: number;
  type: "unexpected" | "missing";
  confidence: number;
}

export interface AzureAssessment {
  /** Azure's RecognitionStatus ("Success", "NoMatch", ...); "Unknown" if absent. */
  status: string;
  /** Overall PronScore, if present. */
  pronScore: number | null;
  /** Null unless prosody assessment was enabled (en-US only). */
  prosodyScore: number | null;
  accuracy: number | null;
  fluency: number | null;
  completeness: number | null;
  words: AzureWord[];
  /** True if Azure tagged the utterance as Monotone (it tags every word). */
  monotone: boolean;
  /** Breaks Azure listed as an error type, or whose confidence is at or above BREAK_CONFIDENCE_THRESHOLD. */
  breaks: AzureBreak[];
}

/** Microsoft suggests 0.75 on the UnexpectedBreak / MissingBreak confidences. */
export const BREAK_CONFIDENCE_THRESHOLD = 0.75;

const TICKS_PER_SEC = 1e7;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const sec = (v: unknown): number => (num(v) ?? 0) / TICKS_PER_SEC;
const secOrNull = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : n / TICKS_PER_SEC;
};
const errorTypes = (v: unknown): string[] => arr(obj(v).ErrorTypes).filter((x): x is string => typeof x === "string");

/** Accepts the result as a JSON string (what the SDK gives) or an already parsed object. */
export function parseAzureResult(json: unknown): AzureAssessment {
  let root: Obj;
  if (typeof json === "string") {
    try {
      root = obj(JSON.parse(json));
    } catch {
      root = {};
    }
  } else {
    root = obj(json);
  }
  const best = obj(arr(root.NBest)[0]);
  const overall = obj(best.PronunciationAssessment);

  let monotone = false;
  const breaks: AzureBreak[] = [];

  const words: AzureWord[] = arr(best.Words).map((rawWord, wordIndex) => {
    const w = obj(rawWord);
    const pa = obj(w.PronunciationAssessment);
    const errorType = str(pa.ErrorType) ?? "None";
    const prosody = obj(obj(pa.Feedback ?? w.Feedback).Prosody);

    if (errorType === "Monotone" || errorTypes(prosody.Intonation).includes("Monotone")) monotone = true;

    const brk = obj(prosody.Break);
    const listed = errorTypes(brk);
    const unexpected = num(obj(brk.UnexpectedBreak).Confidence);
    const missing = num(obj(brk.MissingBreak).Confidence);
    if (listed.includes("UnexpectedBreak") || (unexpected !== null && unexpected >= BREAK_CONFIDENCE_THRESHOLD)) {
      breaks.push({ wordIndex, type: "unexpected", confidence: unexpected ?? 1 });
    }
    if (listed.includes("MissingBreak") || (missing !== null && missing >= BREAK_CONFIDENCE_THRESHOLD)) {
      breaks.push({ wordIndex, type: "missing", confidence: missing ?? 1 });
    }

    const syllables: AzureSyllable[] = arr(w.Syllables).map((rawSyl) => {
      const s = obj(rawSyl);
      return {
        ipa: str(s.Syllable) ?? "",
        grapheme: str(s.Grapheme),
        offsetSec: sec(s.Offset),
        durationSec: sec(s.Duration),
        accuracy: num(obj(s.PronunciationAssessment).AccuracyScore),
      };
    });

    const phonemes: AzurePhoneme[] = arr(w.Phonemes).map((rawPh) => {
      const p = obj(rawPh);
      const ppa = obj(p.PronunciationAssessment);
      return {
        ipa: str(p.Phoneme) ?? "",
        accuracy: num(ppa.AccuracyScore),
        nbest: arr(ppa.NBestPhonemes).map((n) => ({ ipa: str(obj(n).Phoneme) ?? "", score: num(obj(n).Score) ?? 0 })),
        offsetSec: secOrNull(p.Offset),
        durationSec: secOrNull(p.Duration),
      };
    });

    return {
      word: str(w.Word) ?? "",
      offsetSec: sec(w.Offset),
      durationSec: sec(w.Duration),
      accuracy: num(pa.AccuracyScore),
      errorType,
      syllables,
      phonemes,
    };
  });

  return {
    status: str(root.RecognitionStatus) ?? "Unknown",
    pronScore: num(overall.PronScore),
    prosodyScore: num(overall.ProsodyScore),
    accuracy: num(overall.AccuracyScore),
    fluency: num(overall.FluencyScore),
    completeness: num(overall.CompletenessScore),
    words,
    monotone,
    breaks,
  };
}

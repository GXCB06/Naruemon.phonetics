// SSML for the reference voices (task B6): turn a sentence's target levels into Azure Neural TTS `<prosody contour>`s.
// Pure: no network, no DOM. tools/make-tts.ts sends the SSML to Azure and checks every clip with our own pipeline.
//
// One `<prosody contour>` per thought group, with a `<break>` between groups, so each group gets its own tune and the
// pause the engine uses to split thought groups. Contour times are % of the group's spoken duration; we place each
// syllable by an estimated length (stressed and final syllables are longer, short function words shorter), which is close
// enough for the peak to land on the nucleus. Values are % change of the voice's pitch: level 2 = +0%, and one level = 4
// semitones (the same mapping as the engine), times a `gain` that later attempts raise when a voice under-shoots.

import { SEMITONES_PER_LEVEL } from "../intonation/contour.ts";
import type { PatternId, Sentence, ThoughtGroup, Word } from "../intonation/types.ts";

/**
 * The two reference voices. Non-HD voices: the HD ("DragonHD") voices ignore `<prosody>`. Male: Jason, not Guy: our pitch
 * tracker (pitchy, src/lib/audio/pitch.ts) reads Guy an octave too high and loses his low endings, so none of his clips
 * could be checked fairly (Guy 11/61 sentences vs Jason 30/61 in a test of 2,000+ clips, Nov 2026).
 */
export const TTS_VOICES = [
  { id: "f", name: "en-US-JennyNeural" },
  { id: "m", name: "en-US-JasonNeural" },
] as const;

export type VoiceId = (typeof TTS_VOICES)[number]["id"];

export interface SsmlOptions {
  /** Multiplies every level's distance from level 2 (1 = the course's 4 semitones per level). */
  gain?: number;
  /** Extra multiplier for levels BELOW 2 (TTS voices resist going low, so the fall to level 1 may need a push). */
  fallGain?: number;
  /**
   * "original": the sentence's own punctuation. "pattern": end each group with the punctuation whose natural tune matches
   * its pattern (2-3-1 and 3-1 "." so a sure tag falls, 2-3-2 ",", 2-3 "?" at the end and "," inside), so the voice's own
   * intonation helps the contour instead of fighting it.
   */
  punctuation?: "original" | "pattern";
  /** Pause between thought groups. */
  breakMs?: number;
  /** Speaking rate, e.g. "-10%" (a little slower for learners); "" leaves the voice's own rate. */
  rate?: string;
  /**
   * "group": one contour over each thought group. "word": a contour only on the words that change level (the nucleus and
   * what follows it) and `pitch` on words held off level 2; level-2 words are left alone. "none": no pitch markup, only
   * punctuation and pauses (the voice's own tune).
   */
  shape?: "group" | "word" | "none";
  /**
   * "sparse": only the points where the line turns (Azure often ignores contours with many points). "dense": two points per
   * syllable.
   */
  points?: "sparse" | "dense";
  /**
   * "word" shape only: pitch change (%) for the words before the nucleus word, e.g. -12. TTS voices like to accent the
   * first content word; lowering the run-up keeps the one peak of the group on the nucleus. 0 leaves them alone.
   */
  prePct?: number;
  /**
   * Raises (or lowers) the whole voice by this %, folded into every pitch value. A higher base keeps the fall to level 1
   * out of the creaky bottom of the voice, where the pitch tracker (and a listener) loses it.
   */
  basePct?: number;
}

export interface ContourPoint {
  /** % of the group's duration, 0..100. */
  t: number;
  /** % pitch change from the voice's normal pitch. */
  pct: number;
}

const DEFAULTS: Required<SsmlOptions> = {
  gain: 1,
  fallGain: 1,
  punctuation: "original",
  breakMs: 250,
  rate: "",
  shape: "word",
  points: "sparse",
  prePct: 0,
  basePct: 0,
};

/** Two % changes applied one after the other, as one %. */
function stack(a: number, b: number): number {
  return Math.round(((1 + a / 100) * (1 + b / 100) - 1) * 100);
}

const signed = (n: number) => `${n >= 0 ? "+" : ""}${n}%`;

/** Pitch change in % for a course level (level 2 = 0%). `fallGain` multiplies further for levels below 2. */
export function levelToPercent(level: number, gain = 1, fallGain = 1): number {
  const st = (level - 2) * SEMITONES_PER_LEVEL * gain * (level < 2 ? fallGain : 1);
  return (Math.pow(2, st / 12) - 1) * 100;
}

/** Rough relative length of each syllable of a group: longer when stressed, longer at the end of the group, longer with more letters. */
export function syllableWeights(group: ThoughtGroup): number[] {
  const sylls = group.words.flatMap((w) => w.syllables);
  return sylls.map((s, i) => {
    const letters = s.text.replace(/[^A-Za-z]/g, "").length;
    return 0.6 + 0.1 * letters + (s.stressed ? 0.5 : 0) + (i === sylls.length - 1 ? 0.4 : 0);
  });
}

/**
 * The contour of one thought group (or one word, passed as a one-word group). Each syllable is placed by its estimated
 * length; a level held for a syllable is one point in its middle ("sparse") or two points ("dense"), a glide is two points.
 * Sparse contours drop the inner points of flat stretches and stretch the first/last point to 0% and 100%.
 */
export function groupContour(
  group: ThoughtGroup,
  options: Pick<SsmlOptions, "gain" | "fallGain" | "points" | "basePct"> = {},
): ContourPoint[] {
  const { gain = 1, fallGain = 1, points = "sparse", basePct = 0 } = options;
  const sylls = group.words.flatMap((w) => w.syllables);
  const weights = syllableWeights(group);
  const total = weights.reduce((a, b) => a + b, 0);
  let raw: { t: number; level: number }[] = [];
  let pos = 0;
  sylls.forEach((s, i) => {
    const a = pos / total;
    const w = weights[i] / total;
    const lv = s.levels;
    if (lv.length > 1) raw.push({ t: a + 0.2 * w, level: lv[0] }, { t: a + 0.85 * w, level: lv[lv.length - 1] });
    else if (points === "dense") raw.push({ t: a + 0.25 * w, level: lv[0] }, { t: a + 0.75 * w, level: lv[0] });
    else raw.push({ t: a + 0.5 * w, level: lv[0] });
    pos += weights[i];
  });
  if (points === "dense") {
    raw.unshift({ t: 0, level: raw[0].level });
    raw.push({ t: 1, level: raw[raw.length - 1].level });
  } else {
    // keep only the ends of each flat run, then pin the line to both ends of the span
    raw = raw.filter((p, i) => i === 0 || i === raw.length - 1 || p.level !== raw[i - 1].level || p.level !== raw[i + 1].level);
    raw[0] = { ...raw[0], t: 0 };
    if (raw.length > 1) raw[raw.length - 1] = { ...raw[raw.length - 1], t: 1 };
    else raw.push({ t: 1, level: raw[0].level });
  }

  const out: ContourPoint[] = [];
  for (const p of raw) {
    const t = Math.round(p.t * 100);
    const pct = stack(levelToPercent(p.level, gain, fallGain), basePct);
    const last = out[out.length - 1];
    if (last && last.t === t) last.pct = pct; // two points on the same % step: keep the later one
    else out.push({ t, pct });
  }
  return out;
}

/**
 * One word of a group as SSML. A word that changes level (the nucleus, a glide, the fall after the peak) gets a `contour`
 * over its own syllables; a word held on another level gets `pitch`; a level-2 word is left as it is.
 */
export function wordProsody(
  word: Word,
  text: string,
  options: Pick<SsmlOptions, "gain" | "fallGain" | "points" | "basePct"> = {},
): string {
  const one: ThoughtGroup = { pattern: "2-3-1", words: [word], nucleus: { word: 0, syllable: 0 } };
  const points = groupContour(one, options);
  const flat = points.every((p) => p.pct === points[0].pct);
  if (flat && points[0].pct === 0) return text;
  return flat
    ? `<prosody pitch="${signed(points[0].pct)}">${text}</prosody>`
    : `<prosody contour="${contourAttr(points)}">${text}</prosody>`;
}

/** The `contour` attribute value: "(0%,+0%) (40%,+26%) (100%,-21%)". */
export function contourAttr(points: readonly ContourPoint[]): string {
  return points.map((p) => `(${p.t}%,${signed(p.pct)})`).join(" ");
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Punctuation whose natural tune matches a group's pattern. */
function punctuationFor(pattern: PatternId, isLast: boolean, original: string): string {
  switch (pattern) {
    case "2-3-1":
      // keep "!" for exclamations; otherwise "." (a "?" can make the voice rise, a "," keeps the part open)
      return isLast && original === "!" ? "!" : ".";
    case "3-1":
      return ".";
    case "2-3-2":
      return ",";
    case "2-3":
      return isLast ? "?" : ",";
  }
}

/** The words of a group as they are spoken, with the group's end punctuation chosen by `mode`. */
export function groupText(group: ThoughtGroup, isLast: boolean, mode: "original" | "pattern" = "original"): string {
  const text = group.words.map((w) => w.text).join(" ");
  if (mode === "original") return text;
  const m = /^(.*?)([.,;:!?]*)$/.exec(text) as RegExpExecArray;
  const original = m[2].slice(-1);
  return m[1] + punctuationFor(group.pattern, isLast, original);
}

/** Full SSML for one sentence and one voice. */
export function buildSsml(sentence: Sentence, voiceName: string, options: SsmlOptions = {}): string {
  const o = { ...DEFAULTS, ...options };
  const parts = sentence.groups.map((g, gi) => {
    const isLast = gi === sentence.groups.length - 1;
    const text = groupText(g, isLast, o.punctuation);
    const rate = (inner: string) => (o.rate ? `<prosody rate="${o.rate}">${inner}</prosody>` : inner);
    if (o.shape === "none") return rate(o.basePct ? `<prosody pitch="${signed(o.basePct)}">${escapeXml(text)}</prosody>` : escapeXml(text));
    if (o.shape === "group") return rate(`<prosody contour="${contourAttr(groupContour(g, o))}">${escapeXml(text)}</prosody>`);
    // "word": the spoken words (with the chosen punctuation) split back onto the group's words
    const spoken = text.split(" ").map(escapeXml);
    const pre = o.prePct ? g.nucleus.word : 0; // words before the nucleus word, lowered together
    const head = pre > 0 ? [`<prosody pitch="${signed(stack(o.prePct, o.basePct))}">${spoken.slice(0, pre).join(" ")}</prosody>`] : [];
    const tail = g.words.slice(pre).map((w, k) => wordProsody(w, spoken[pre + k] ?? "", o));
    return rate([...head, ...tail].join(" "));
  });
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">` +
    `<voice name="${escapeXml(voiceName)}">` +
    parts.join(`<break time="${o.breakMs}ms"/>`) +
    `</voice></speak>`
  );
}

/** The words Azure reads aloud (what TTS bills), without the markup. */
export function spokenText(ssml: string): string {
  return ssml
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|lt|gt|quot|apos);/g, "x")
    .replace(/\s+/g, " ")
    .trim();
}

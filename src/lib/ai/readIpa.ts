// Reading handwritten IPA (IPA practice, Write mode). Pure part: request validation, the prompt and the answer shape.
// Claude only READS the writing; the app grades it (src/lib/ipa/practice.ts), after the student confirms what was read.

export const MAX_IMAGE_BASE64 = 1_500_000; // ~1.1 MB PNG: a cropped pad drawing is far smaller

export function parseReadRequest(body: unknown): { ok: true; png: string } | { ok: false; error: string } {
  const img = (body as Record<string, unknown> | null)?.image;
  if (typeof img !== "string") return { ok: false, error: "image must be a base64 PNG string" };
  const data = img.startsWith("data:image/png;base64,") ? img.slice("data:image/png;base64,".length) : img;
  if (!data || data.length > MAX_IMAGE_BASE64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return { ok: false, error: "bad image" };
  // PNG files start with \x89PNG, which is "iVBORw0KGgo" in base64
  if (!data.startsWith("iVBORw0KGgo")) return { ok: false, error: "not a PNG" };
  return { ok: true, png: data };
}

export const READ_PROMPT = `The image shows a student's handwritten IPA transcription of ONE English word (American English), written with a finger or a stylus on a tablet.
Your job is to READ it, not to check it. Transcribe exactly what is written. Do NOT correct mistakes and do not guess the word: if the student wrote a wrong symbol, return that wrong symbol.

Work left to right, one written symbol at a time. For each one, say briefly what shape you see ("seen"), then the IPA symbol it is ("symbol"), and mark "unsure" when two symbols are plausible.

The class writes American English with these symbols: i ɪ eɪ ɛ æ ʌ ə ɜ u ʊ oʊ ɔ ɑ aɪ aʊ ɔɪ p b t d k g f v θ ð s z ʃ ʒ h tʃ dʒ m n ŋ l r w j, r-coloured vowels as ər and ɜr (actor /ˈæktər/, first /fɜrst/), and the stress mark ˈ (a short raised vertical tick before a syllable). Students may also add ː.
Students' handwriting habits:
- ɪ is written as a small CAPITAL I (a short bar with serifs at top and bottom). Read it as ɪ, never as "I" or "l".
- ʊ looks like a small capital U or a horseshoe with flicks at the top. ɛ looks like a backwards 3; ɜ like a 3; ʒ like a 3 that drops below the line.
- Other letters are sometimes written as capitals (N, S, R, D): read them as the lowercase IPA letter they stand for (n, s, r, d).
- A plain r is written like r; a turned ɹ is upside down. Write the one you see.
Look carefully at look-alike shapes: ʊ vs u, ɪ vs i (is there a dot?) vs l, ə vs e, ɛ vs e vs ɜ, ʌ vs v, ɑ vs a, æ vs ae, θ vs 0, ð vs d, ŋ vs n (ŋ has a tail below the line), ʃ vs f, ʒ vs z vs 3, s vs z.
Ignore slashes and brackets. If nothing readable is written, return no glyphs.`;

export const READ_SCHEMA = {
  type: "object",
  properties: {
    glyphs: {
      type: "array",
      items: {
        type: "object",
        properties: { seen: { type: "string" }, symbol: { type: "string" }, unsure: { type: "boolean" } },
        required: ["seen", "symbol", "unsure"],
        additionalProperties: false,
      },
    },
  },
  required: ["glyphs"],
  additionalProperties: false,
} as const;

/** The reading as an IPA string plus the symbols Claude was not sure about. */
export function parseReading(text: string): { ipa: string; unsure: string[] } | null {
  try {
    const v = JSON.parse(text) as { glyphs?: unknown };
    if (!Array.isArray(v.glyphs)) return null;
    const glyphs = v.glyphs
      .filter((g): g is { symbol: string; unsure?: unknown } => !!g && typeof (g as { symbol?: unknown }).symbol === "string")
      .slice(0, 30);
    const ipa = glyphs.map((g) => g.symbol.trim()).join("").slice(0, 60);
    const unsure = glyphs.filter((g) => g.unsure === true && g.symbol.trim().length <= 3).map((g) => g.symbol.trim()).slice(0, 6);
    return { ipa, unsure };
  } catch {
    return null;
  }
}

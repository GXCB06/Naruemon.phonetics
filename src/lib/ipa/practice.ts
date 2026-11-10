// IPA practice: build a word's transcription from symbol tiles (or write it, then confirm with the symbol keyboard).
// Pure: no DOM, no React. The IPA comes from CMUdict via tools/build-ipa-practice.ts (US English) and is shown in the
// class's notation (src/lib/ipa/notation.ts): r (not ɹ), ər and ɜr (not ɚ, ɝ), diphthongs and affricates as ONE tile,
// ˈ before the stressed syllable of a word with more than one syllable.

import type { Bilingual } from "../intonation/types.ts";
import { classIpa } from "./notation.ts";
import practiceTable from "./practice.generated.json" with { type: "json" };
import { PRACTICE_WORDS } from "./practiceWords.ts";
import type { WordIpa } from "./words.ts";

export const VOWELS = ["i", "ɪ", "eɪ", "ɛ", "æ", "ʌ", "ə", "ɜ", "u", "ʊ", "oʊ", "ɔ", "ɑ", "aɪ", "aʊ", "ɔɪ"] as const;
export const CONSONANTS = ["p", "b", "t", "d", "k", "ɡ", "f", "v", "θ", "ð", "s", "z", "ʃ", "ʒ", "h", "tʃ", "dʒ", "m", "n", "ŋ", "l", "r", "w", "j"] as const;
export const STRESS = "ˈ";
export const SYMBOLS: readonly string[] = [...VOWELS, ...CONSONANTS, STRESS];
const MULTI = SYMBOLS.filter((s) => s.length > 1).sort((a, b) => b.length - a.length);

export interface PracticeWord {
  word: string;
  th: string;
  /** The answer, one symbol per tile, e.g. ["ˈ", "s", "t", "u", "d", "ə", "n", "t"]. */
  tokens: string[];
  /** Display form, e.g. "/ˈstudənt/". */
  display: string;
}

/** Split IPA into the app's symbols (longest match first). Unknown characters come back as "?x". */
export function splitSymbols(ipa: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < ipa.length; ) {
    const m = MULTI.find((x) => ipa.startsWith(x, i));
    if (m) {
      out.push(m);
      i += m.length;
      continue;
    }
    const c = ipa[i];
    out.push(SYMBOLS.includes(c) ? c : "?" + c);
    i += 1;
  }
  return out;
}

/** The answer tiles for a word: the stress mark before the primary-stressed syllable (only when there are several). */
export function wordTokens(entry: WordIpa): string[] {
  const many = entry.syllables.length > 1;
  return entry.syllables.flatMap((s) => [...(many && s.stress === 1 ? [STRESS] : []), ...splitSymbols(classIpa(s.ipa))]);
}

const TABLE = (practiceTable as { words: Record<string, WordIpa> }).words;

/** Every practice word with its answer. Throws if the generated table is out of date (run npm run build:ipa-practice). */
export function practiceWords(): PracticeWord[] {
  return PRACTICE_WORDS.map(({ word, th }) => {
    const entry = TABLE[word];
    if (!entry) throw new Error(`"${word}" is missing from practice.generated.json: run npm run build:ipa-practice`);
    const tokens = wordTokens(entry);
    return { word, th, tokens, display: `/${tokens.join("")}/` };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Decoy tiles: the symbols Thai learners confuse with the ones in the word.
// ---------------------------------------------------------------------------------------------------------------------

export const CONFUSABLE: Readonly<Record<string, readonly string[]>> = {
  θ: ["t", "s", "ð"], ð: ["d", "θ", "z"], v: ["w", "b", "f"], w: ["v", "ʊ"], z: ["s", "ʒ"], s: ["z", "ʃ", "θ"],
  ʃ: ["s", "tʃ", "ʒ"], ʒ: ["ʃ", "dʒ", "z"], tʃ: ["ʃ", "dʒ", "t"], dʒ: ["ʒ", "tʃ", "j"], ŋ: ["n", "ɡ"], n: ["ŋ", "l"],
  l: ["r", "n"], r: ["l", "w"], k: ["ɡ", "t"], ɡ: ["k"], p: ["b", "f"], b: ["p", "v"], t: ["d", "θ"], d: ["t", "ð"],
  f: ["v", "p"], j: ["dʒ", "i"], m: ["n"],
  ɪ: ["i", "ɛ"], i: ["ɪ", "eɪ"], ɛ: ["eɪ", "æ", "ɪ"], æ: ["ɛ", "ʌ", "ɑ"], ʌ: ["ɑ", "ə", "æ"], ɑ: ["ʌ", "ɔ", "oʊ"],
  ɔ: ["ɑ", "oʊ"], ʊ: ["u", "ʌ"], u: ["ʊ", "oʊ"], eɪ: ["ɛ", "i"], oʊ: ["ɔ", "u"], aɪ: ["eɪ", "ɪ"], aʊ: ["oʊ", "ɔ"],
  ɔɪ: ["oʊ", "aɪ"], ə: ["ʌ", "ɛ", "ɪ"], ɜ: ["ʌ", "ə"],
};

/** A small deterministic generator, so a round can be replayed in tests. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------------------------------------------------
// Focus rounds: My Progress links to /ipa?focus=θ,z so a round practises the learner's weakest sounds.
// ---------------------------------------------------------------------------------------------------------------------

/** The sounds in a `focus` query ("θ,z" or "θ, z"): known symbols only (no stress mark), each once, in order. */
export function parseFocus(query: string | null | undefined): string[] {
  if (!query) return [];
  const out: string[] = [];
  for (const part of query.split(",")) {
    const sym = normalizeIpa(part.trim());
    if (sym && sym !== STRESS && SYMBOLS.includes(sym) && !out.includes(sym)) out.push(sym);
  }
  return out;
}

/** The query string value for a focus list ("θ,z"). Callers URL-encode it. */
export function focusQuery(symbols: readonly string[]): string {
  return symbols.filter((s) => s !== STRESS && SYMBOLS.includes(s)).join(",");
}

/**
 * A round of `size` words. With focus sounds: first one word for each focus sound (in turn, while words are left), then
 * more words containing any focus sound, then the rest, so a round always has `size` words when the bank allows. The
 * chosen words are shuffled.
 * Without focus: a plain shuffle.
 */
export function pickRoundWords(all: readonly PracticeWord[], size: number, rand: () => number, focus: readonly string[] = []): PracticeWord[] {
  const pool = shuffle(all, rand);
  const wanted = focus.filter((s) => s !== STRESS);
  if (wanted.length === 0) return pool.slice(0, size);
  const picked: PracticeWord[] = [];
  const take = (w: PracticeWord) => {
    if (picked.length < size && !picked.includes(w)) picked.push(w);
  };
  for (const sym of wanted) {
    const w = pool.find((x) => !picked.includes(x) && x.tokens.includes(sym));
    if (w) take(w);
  }
  for (const w of pool) if (w.tokens.some((t) => wanted.includes(t))) take(w);
  for (const w of pool) take(w);
  return shuffle(picked, rand); // focus words spread through the round, not all at the start
}

/** 3 or 4 decoys that confuse with the word's own symbols (never one of them), never the glottal stop or the stress mark. */
export function decoysFor(tokens: readonly string[], rand: () => number): string[] {
  const own = new Set(tokens);
  const pool: string[] = [];
  for (const t of shuffle(tokens.filter((x) => x !== STRESS), rand))
    for (const c of CONFUSABLE[t] ?? []) if (!own.has(c) && SYMBOLS.includes(c) && !pool.includes(c)) pool.push(c);
  return pool.slice(0, tokens.length >= 6 ? 4 : 3);
}

/** The tile bank for a word: its own symbols plus decoys, shuffled. */
export function tileBank(word: PracticeWord, rand: () => number): string[] {
  return shuffle([...word.tokens, ...decoysFor(word.tokens, rand)], rand);
}

// ---------------------------------------------------------------------------------------------------------------------
// Grading. Other notations for the same sounds (ɹ, ɚ, ɝ, ː, əʊ, syllabic l̩ …) are turned into the class's notation.
// ---------------------------------------------------------------------------------------------------------------------

export function normalizeIpa(s: string): string {
  return s
    .normalize("NFC")
    // handwriting: ɪ is written as a small capital I and ʊ as a small capital U; other capitals mean the lowercase
    // letter (N = n, S = s); a "3" is the open-mid ɜ
    .replace(/[Iıɩ]/g, "ɪ")
    .replace(/[Uᴜ]/g, "ʊ")
    .replace(/3/g, "ɜ")
    .replace(/[A-Z]/g, (c) => c.toLowerCase())
    .replace(/([lnm])̩/g, "ə$1")
    .replace(/[/[\]\s.ˌ‿-]/g, "")
    .replace(/['’ʹ]/g, STRESS)
    .replace(/[ːˑ:]/g, "")
    .replace(/ɜ˞/g, "ɝ")
    .replace(/ə˞/g, "ɚ")
    .replace(/ɚ/g, "ər")
    .replace(/ɝ/g, "ɜr")
    .replace(/ɹ/g, "r")
    .replace(/g/g, "ɡ")
    .replace(/ʧ/g, "tʃ")
    .replace(/ʤ/g, "dʒ")
    .replace(/əʊ|ou/g, "oʊ")
    .replace(/ɒ/g, "ɑ")
    .replace(/ei/g, "eɪ")
    .replace(/ai/g, "aɪ")
    .replace(/au/g, "aʊ")
    .replace(/ɔi/g, "ɔɪ")
    .replace(/e(?!ɪ)/g, "ɛ")
    .replace(/ɐ/g, "ʌ")
    .replace(/ɫ/g, "l")
    .replace(/ɾ/g, "t");
}

/** Typed or handwritten IPA → the app's symbols. */
export function parseIpa(s: string): string[] {
  return splitSymbols(normalizeIpa(s));
}

const TIP: Record<string, Bilingual> = {};
const tip = (pairs: string[], en: string, th: string) => pairs.forEach((p) => (TIP[p] = { en, th }));
tip(["θ|t", "θ|s", "t|θ", "s|θ"], "θ (think) puts the tongue between the teeth and blows air. Thai speakers often say t or s instead.", "θ (think) วางปลายลิ้นระหว่างฟันแล้วเป่าลม คนไทยมักออกเป็น t หรือ s แทน");
tip(["ð|d", "ð|θ", "d|ð", "θ|ð", "ð|z"], "ð (this, mother) is the voiced th: tongue between the teeth, and your voice is on. θ has no voice.", "ð (this, mother) คือเสียง th แบบก้อง วางลิ้นระหว่างฟันและเปล่งเสียง ส่วน θ ไม่ก้อง");
tip(["v|w", "w|v", "v|b", "b|v", "v|f", "f|v"], "v (very): the top teeth touch the bottom lip, with voice. w uses round lips and no teeth; b closes both lips.", "v (very) ฟันบนแตะริมฝีปากล่างและก้อง ส่วน w ห่อปากกลมไม่ใช้ฟัน และ b ปิดริมฝีปากทั้งสอง");
tip(["z|s"], "This s sounds like z: after a voiced sound, final s is voiced. rains = /reɪnz/.", "ตัว s ตรงนี้ออกเสียง z เมื่ออยู่หลังเสียงก้อง เช่น rains = /reɪnz/");
tip(["s|z"], "Here it's a real s with no voice, like a snake: bus = /bʌs/.", "คำนี้เป็นเสียง s จริง ๆ ไม่ก้อง เหมือนเสียงงู: bus = /bʌs/");
tip(["ʊ|u", "u|ʊ"], "ʊ (book) is short and relaxed. u (zoo, student) is longer, with tight round lips.", "ʊ (book) สั้นและผ่อนคลาย ส่วน u (zoo, student) ยาวกว่าและห่อปากแน่น");
tip(["ɪ|i", "i|ɪ"], "ɪ (ship) is short and relaxed. i (cheap, very) is longer, with a smile.", "ɪ (ship) สั้นและผ่อนคลาย ส่วน i (cheap, very) ยาวกว่าและฉีกยิ้ม");
tip(["eɪ|ɛ", "ɛ|eɪ", "eɪ|i"], "eɪ (name) moves from e to ɪ, a glide. ɛ (very) stays still.", "eɪ (name) เลื่อนจาก e ไป ɪ เป็นสระประสม ส่วน ɛ (very) ไม่เลื่อน");
tip(["æ|ɛ", "ɛ|æ", "æ|ʌ"], "æ (cat, thank) opens the mouth wide, like Thai แอ. ɛ is smaller, like เอะ.", "æ (cat, thank) อ้าปากกว้างเหมือน แอ ส่วน ɛ อ้าน้อยกว่าเหมือน เอะ");
tip(["ʌ|ɑ", "ɑ|ʌ", "ʌ|æ", "ʌ|ə"], "ʌ (bus, cup) is short with the mouth half open, like อะ. ɑ (job) opens wide and is longer, like อา.", "ʌ (bus, cup) สั้น อ้าปากครึ่งเดียวเหมือน อะ ส่วน ɑ (job) อ้ากว้างและยาวกว่าเหมือน อา");
tip(["ʒ|ʃ", "ʃ|ʒ", "ʒ|dʒ"], "ʒ (pleasure) is voiced, your throat buzzes. ʃ (ship) has no voice.", "ʒ (pleasure) เป็นเสียงก้อง คอสั่น ส่วน ʃ (ship) ไม่ก้อง");
tip(["ʃ|tʃ", "tʃ|ʃ", "ʃ|s"], "ʃ (ship, fish) is a long hush, like ช in a whisper. tʃ (cheap) starts with a t stop: t + ʃ.", "ʃ (ship, fish) เป็นเสียงชู่ยาว ๆ ส่วน tʃ (cheap) เริ่มด้วยการหยุดแบบ t แล้วตามด้วย ʃ");
tip(["dʒ|ʒ", "dʒ|tʃ", "tʃ|dʒ"], "dʒ (job, vegetable) is tʃ with voice. tʃ (cheap) has no voice.", "dʒ (job, vegetable) คือ tʃ แบบก้อง ส่วน tʃ (cheap) ไม่ก้อง");
tip(["ə|ɜ", "ɜ|ə"], "ɜ is the stressed vowel of bird and world (/bɜrd/); ə is the short, weak schwa of mother and water (/ˈmʌðər/).", "ɜ คือสระที่ลงเสียงหนักใน bird และ world (/bɜrd/) ส่วน ə คือ schwa เสียงสั้นเบาใน mother และ water (/ˈmʌðər/)");
tip(["ɜ|ʌ", "ʌ|ɜ"], "ɜ (bird, world) comes with an r in American English: /bɜrd/. ʌ (bus, cup) is a short vowel with no r.", "ɜ (bird, world) ตามด้วย r ในสำเนียงอเมริกัน: /bɜrd/ ส่วน ʌ (bus, cup) เป็นสระสั้นที่ไม่มี r");
tip(["ŋ|n", "n|ŋ", "ŋ|ɡ"], "ŋ (sing, think) is made at the back of the mouth, like Thai ง. n uses the tongue tip.", "ŋ (sing, think) ออกเสียงที่โคนลิ้น เหมือน ง ในภาษาไทย ส่วน n ใช้ปลายลิ้น");
tip(["ə|ɛ", "ə|ɪ", "ə|ʌ", "ə|ʊ"], "Syllables without stress usually become ə, the short, lazy schwa: student /ˈstudənt/, table /ˈteɪbəl/.", "พยางค์ที่ไม่เน้นมักกลายเป็น ə (schwa) เสียงสั้น ๆ เบา ๆ เช่น /ˈstudənt/, /ˈteɪbəl/");
tip(["r|l", "l|r", "r|w"], "r (right, three): the tongue doesn't touch the roof of the mouth. l (light) touches it behind the teeth.", "r (right, three) ลิ้นไม่แตะเพดานปาก ส่วน l (light) ปลายลิ้นแตะหลังฟันบน");
tip(["k|ɡ", "ɡ|k", "p|b", "b|p", "t|d", "d|t"], "Listen for the voice: b, d, ɡ are voiced; p, t, k are not. English final p, t, k are quiet but still there.", "ฟังว่าก้องหรือไม่: b, d, ɡ ก้อง ส่วน p, t, k ไม่ก้อง เสียง p, t, k ท้ายคำเบาแต่ยังต้องมี");
tip(["oʊ|ɔ", "ɔ|oʊ", "oʊ|u", "ɔ|ɑ", "ɑ|ɔ"], "oʊ (boat) glides from o to ʊ. ɔ (water) is one open, round vowel.", "oʊ (boat) เลื่อนจาก o ไป ʊ ส่วน ɔ (water) เป็นสระเดี่ยว ห่อปากกว้าง");
tip(["aɪ|eɪ", "aɪ|ɪ"], "aɪ (light, right) starts wide open, like ไอ. eɪ starts at e.", "aɪ (light, right) เริ่มอ้าปากกว้างเหมือน ไอ ส่วน eɪ เริ่มที่ e");
export const STRESS_TIP: Bilingual = { en: "Put ˈ right before the stressed syllable.", th: "ใส่ ˈ ไว้หน้าพยางค์ที่ลงเสียงหนัก" };

interface AlignOp {
  type: "sub" | "extra" | "missing";
  want?: string;
  got?: string;
}
/** Edit-distance alignment: which placed symbols are wrong, and what went wrong where. */
export function alignSymbols(want: readonly string[], got: readonly string[]): { badGot: Set<number>; ops: AlignOp[] } {
  const n = want.length;
  const m = got.length;
  const D: number[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (want[i - 1] === got[j - 1] ? 0 : 1));
  const badGot = new Set<number>();
  const ops: AlignOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + (want[i - 1] === got[j - 1] ? 0 : 1)) {
      if (want[i - 1] !== got[j - 1]) {
        badGot.add(j - 1);
        ops.unshift({ type: "sub", want: want[i - 1], got: got[j - 1] });
      }
      i--;
      j--;
    } else if (j > 0 && D[i][j] === D[i][j - 1] + 1) {
      badGot.add(j - 1);
      ops.unshift({ type: "extra", got: got[j - 1] });
      j--;
    } else {
      ops.unshift({ type: "missing", want: want[i - 1] });
      i--;
    }
  }
  return { badGot, ops };
}

export type IpaGrade = "perfect" | "good" | "miss";
export interface IpaResult {
  grade: IpaGrade;
  /** Indexes of the learner's symbols that are wrong (or misplaced). */
  badGot: Set<number>;
  /** Why (Good: the stress mark; Miss: the first mix-up). Null for Perfect. */
  message: Bilingual | null;
}

/** Perfect = every symbol right; Good = right sounds but the stress mark is missing or misplaced; otherwise Miss. */
export function gradeIpa(want: readonly string[], got: readonly string[]): IpaResult {
  if (got.join(" ") === want.join(" ")) return { grade: "perfect", badGot: new Set(), message: null };
  const noStress = (a: readonly string[]) => a.filter((x) => x !== STRESS).join(" ");
  const { badGot, ops } = alignSymbols(want, got);
  if (noStress(got) === noStress(want)) return { grade: "good", badGot, message: STRESS_TIP };
  const sub = ops.find((o) => o.type === "sub" && o.want !== STRESS && o.got !== STRESS);
  if (sub) {
    const t = TIP[`${sub.want}|${sub.got}`];
    return {
      grade: "miss",
      badGot,
      message: t ?? { en: `You wrote ${sub.got} where the word has ${sub.want}. Listen again and compare.`, th: `คุณใส่ ${sub.got} แต่คำนี้คือ ${sub.want} ลองฟังอีกครั้งแล้วเปรียบเทียบ` },
    };
  }
  const miss = ops.find((o) => o.type === "missing" && o.want !== STRESS);
  const extra = ops.find((o) => o.type === "extra" && o.got !== STRESS);
  const message = miss?.want === "r"
    ? { en: "In American English every r is pronounced, so write it: bird /bɜrd/, mother /ˈmʌðər/.", th: "ในสำเนียงอเมริกันออกเสียง r ทุกตัว จึงต้องเขียน r ด้วย เช่น bird /bɜrd/, mother /ˈmʌðər/" }
    : miss
    ? { en: `A sound is missing: ${miss.want}. Say the word slowly and count its sounds.`, th: `ขาดเสียง ${miss.want} ลองพูดช้า ๆ แล้วนับจำนวนเสียง` }
    : extra
      ? { en: `There's an extra sound: ${extra.got}. English letters aren't always pronounced.`, th: `มีเสียงเกินมา: ${extra.got} ตัวอักษรภาษาอังกฤษไม่ได้ออกเสียงทุกตัว` }
      : STRESS_TIP;
  return { grade: "miss", badGot, message };
}

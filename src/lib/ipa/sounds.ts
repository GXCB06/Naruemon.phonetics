// What each IPA tile says when it is tapped (IPA practice). Pure: no DOM, no React.
//
// A device voice can't say a lone sound like /θ/, only words, so every symbol has a KEY WORD with the letters that make
// the sound ("th" in think). When real recordings exist (public/audio/ipa/<id>.mp3, listed in manifest.json, made by
// tools/make-ipa-sounds.ts or recorded by a teacher), the tile plays the sound itself instead.
// American English, the class's notation (r, ɜ; ər / ɜr are two tiles).

export interface IpaSound {
  /** File-safe name, used for public/audio/ipa/<id>.mp3. */
  id: string;
  /** Key word that contains the sound. */
  word: string;
  /** The letters of `word` that make the sound: [start, end) indexes. */
  mark: [number, number];
  /** What a recording says: the sound alone for vowels and sounds you can hold (s, m, θ), with a schwa for stops (pə). */
  say: string;
  kind: "vowel" | "consonant" | "mark";
}

const S = (id: string, word: string, letters: string, say: string, kind: IpaSound["kind"] = "consonant"): IpaSound => {
  const at = word.indexOf(letters);
  if (at < 0) throw new Error(`"${letters}" is not in "${word}"`);
  return { id, word, mark: [at, at + letters.length], say, kind };
};

export const IPA_SOUNDS: Readonly<Record<string, IpaSound>> = {
  // vowels
  i: S("i", "see", "ee", "i", "vowel"),
  ɪ: S("small-cap-i", "sit", "i", "ɪ", "vowel"),
  eɪ: S("ei", "day", "ay", "eɪ", "vowel"),
  ɛ: S("epsilon", "bed", "e", "ɛ", "vowel"),
  æ: S("ash", "cat", "a", "æ", "vowel"),
  ʌ: S("wedge", "cup", "u", "ʌ", "vowel"),
  ə: S("schwa", "about", "a", "ə", "vowel"),
  ɜ: S("reversed-epsilon", "bird", "ir", "ɜ", "vowel"),
  u: S("u", "food", "oo", "u", "vowel"),
  ʊ: S("upsilon", "book", "oo", "ʊ", "vowel"),
  oʊ: S("ou", "go", "o", "oʊ", "vowel"),
  ɔ: S("open-o", "saw", "aw", "ɔ", "vowel"),
  ɑ: S("script-a", "hot", "o", "ɑ", "vowel"),
  aɪ: S("ai", "my", "y", "aɪ", "vowel"),
  aʊ: S("au", "now", "ow", "aʊ", "vowel"),
  ɔɪ: S("oi", "boy", "oy", "ɔɪ", "vowel"),
  // consonants: stops, affricates and the quiet fricatives f v θ ð (which a TTS voice drops when alone) are said with a
  // schwa; the rest can be held
  p: S("p", "pen", "p", "pə"),
  b: S("b", "bad", "b", "bə"),
  t: S("t", "ten", "t", "tə"),
  d: S("d", "dog", "d", "də"),
  k: S("k", "key", "k", "kə"),
  ɡ: S("g", "go", "g", "ɡə"),
  f: S("f", "fish", "f", "fə"),
  v: S("v", "van", "v", "və"),
  θ: S("theta", "think", "th", "θə"),
  ð: S("eth", "this", "th", "ðə"),
  s: S("s", "sun", "s", "s"),
  z: S("z", "zoo", "z", "z"),
  ʃ: S("esh", "she", "sh", "ʃ"),
  ʒ: S("ezh", "measure", "s", "ʒ"),
  h: S("h", "hat", "h", "hə"),
  tʃ: S("tesh", "chair", "ch", "tʃə"),
  dʒ: S("dezh", "job", "j", "dʒə"),
  m: S("m", "man", "m", "m"),
  n: S("n", "no", "n", "n"),
  ŋ: S("eng", "sing", "ng", "ŋ"),
  l: S("l", "leg", "l", "l"),
  r: S("r", "red", "r", "r"),
  w: S("w", "wet", "w", "wə"),
  j: S("j", "yes", "y", "jə"),
  ˈ: { id: "stress", word: "", mark: [0, 0], say: "", kind: "mark" },
};

export function soundOf(symbol: string): IpaSound | undefined {
  return Object.hasOwn(IPA_SOUNDS, symbol) ? IPA_SOUNDS[symbol] : undefined;
}

/** The key word split around the marked letters, for showing "th" in bold: ["", "th", "ink"]. */
export function keyWordParts(s: IpaSound): [string, string, string] {
  return [s.word.slice(0, s.mark[0]), s.word.slice(s.mark[0], s.mark[1]), s.word.slice(s.mark[1])];
}

// The class's notation (course package "Phonetics and Pronunciation for English Teachers", Chulalongkorn
// University, ch. 4–5): BROAD (phonemic) transcription between slashes, in the American English symbol set of the course.
// Internally the app keeps the CMUdict/Azure symbol set (ɹ, ɚ, ɝ) so it can compare with speech assessment; everything
// shown to learners goes through `classIpa`:
//   - r is written r (rise, tree, car /kɑr/), not the turned ɹ (or ɻ)
//   - r-coloured vowels are written with a separate r: actor /ˈæktər/ (not ɚ), first /fɜrst/ (not ɝ)
//   - broad, not narrow: no aspiration, length, devoicing or other diacritics, no flap [ɾ] or glottal stop [ʔ] for /t/,
//     no dark l [ɫ]. A narrow symbol that reaches the screen (from a speech service or an AI) is written as its phoneme.
// Pure: no DOM, no React.

/** Narrow symbols (and look-alikes) and the broad phoneme each stands for in American English. */
const NARROW_TO_BROAD: Record<string, string> = {
  ɹ: "r",
  ɻ: "r",
  ɾ: "t", // the flap of "water" is the phoneme /t/
  ʔ: "t", // the glottal stop of "button" is the phoneme /t/
  ɫ: "l",
  ɐ: "ʌ",
  ɒ: "ɑ",
  ɨ: "ɪ",
  ᵻ: "ɪ",
  ɵ: "ə",
  ʉ: "u",
  ʧ: "tʃ",
  ʤ: "dʒ",
};

export function classIpa(ipa: string): string {
  return ipa
    .normalize("NFD") // split letters from their combining marks so the marks can be dropped
    .replace(/ɜ˞/g, "ɜr")
    .replace(/ə˞/g, "ər")
    .replace(/[̀-ͯ]/g, "") // combining diacritics: devoiced, syllabic, nasalised, tie bars ...
    .replace(/[ʰʷʲˠʼˑː˞]/g, "") // aspiration, labialisation, palatalisation, velarisation, ejective, length, rhotic hook
    .replace(/ɚ/g, "ər")
    .replace(/ɝ/g, "ɜr")
    .replace(/[ɹɻɾʔɫɐɒɨᵻɵʉʧʤ]/g, (c) => NARROW_TO_BROAD[c] ?? c)
    .normalize("NFC");
}

// The class's IPA notation (course package "Phonetics and Pronunciation for English Teachers", Chulalongkorn
// University, ch. 4–5). Internally the app keeps the CMUdict/Azure symbol set (ɹ, ɚ, ɝ) so it can compare with speech
// assessment; everything shown to learners goes through `classIpa`:
//   - r is written r (rise, tree, car /kɑr/), not the turned ɹ
//   - r-coloured vowels are written with a separate r: actor /ˈæktər/ (not ɚ), first /fɜrst/ (not ɝ)
// Pure: no DOM, no React.

export function classIpa(ipa: string): string {
  return ipa.replace(/ɚ/g, "ər").replace(/ɝ/g, "ɜr").replace(/ɹ/g, "r");
}

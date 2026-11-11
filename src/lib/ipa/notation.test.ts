import { dictionary } from "cmu-pronouncing-dictionary";
import { describe, expect, it } from "vitest";
import { classIpa } from "./notation.ts";
import { OVERRIDES } from "./overrides.ts";
import { buildWordIpa } from "./words.ts";

describe("class notation is broad", () => {
  it("writes r, not the turned ɹ, and r-coloured vowels with a separate r", () => {
    expect(classIpa("ɹaɪz")).toBe("raɪz");
    expect(classIpa("ˈæktɚ")).toBe("ˈæktər");
    expect(classIpa("fɝst")).toBe("fɜrst");
    expect(classIpa("kɑɹ")).toBe("kɑr");
    expect(classIpa("ɻaɪt")).toBe("raɪt");
  });

  it("also takes the rhotic hook written as a diacritic", () => {
    expect(classIpa("ɜ˞")).toBe("ɜr");
    expect(classIpa("ə˞")).toBe("ər");
  });

  it("writes the phoneme, not the narrow sound: flap and glottal stop are /t/, dark l is /l/", () => {
    expect(classIpa("ˈwɔɾɚ")).toBe("ˈwɔtər");
    expect(classIpa("ˈbʌʔn")).toBe("ˈbʌtn");
    expect(classIpa("pɫiz")).toBe("pliz");
  });

  it("drops aspiration, length, devoicing, syllabic marks and tie bars", () => {
    expect(classIpa("pʰɪn")).toBe("pɪn");
    expect(classIpa("siː")).toBe("si");
    expect(classIpa("bɪtl̩")).toBe("bɪtl");
    expect(classIpa("t͡ʃɪp")).toBe("tʃɪp");
    expect(classIpa("ʧɪp")).toBe("tʃɪp");
    expect(classIpa("sp̊ɪn")).toBe("spɪn");
  });

  it("keeps stress marks, syllable dots and the course's own symbols untouched", () => {
    expect(classIpa("ˈprɪ.ti")).toBe("ˈprɪ.ti");
    expect(classIpa("θɪŋk ðə ʃɪp ʒ dʒɔɪ ɡʊd")).toBe("θɪŋk ðə ʃɪp ʒ dʒɔɪ ɡʊd");
    expect(classIpa("eɪ oʊ aɪ aʊ ɔɪ ɛ æ ʌ ə ɜ ʊ ɪ")).toBe("eɪ oʊ aɪ aʊ ɔɪ ɛ æ ʌ ə ɜ ʊ ɪ");
  });

  it("no word of the dictionary comes out with a turned r, an r-coloured vowel symbol or a diacritic", () => {
    const bad = /[ɹɻɚɝɾʔɫʰː˞]|[̀-ͯ]/;
    let checked = 0;
    for (const word of Object.keys(dictionary).filter((w) => /^[a-z']+$/.test(w)).slice(0, 4000)) {
      let ipa: string;
      try {
        ipa = classIpa(buildWordIpa(word, dictionary, OVERRIDES).ipa);
      } catch {
        continue; // a few dictionary entries are not words (symbols): the app never shows them
      }
      expect(bad.test(ipa), `${word} → ${ipa}`).toBe(false);
      checked++;
    }
    expect(checked).toBeGreaterThan(3000);
  });
});

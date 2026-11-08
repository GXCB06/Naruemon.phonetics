// Manual pronunciation overrides for the lesson IPA build (tools/build-ipa.ts).

import type { Override } from "./words.ts";

/**
 * Manual overrides (ARPAbet, stress digits 0/1/2). Use for words CMUdict is missing, or where its first entry is not
 * the pronunciation we teach. Each entry says why. Add a tricky word
 * (e.g. "happy" if we ever want a different final vowel) or a word missing from CMUdict here, never in the JSON.
 */
export const OVERRIDES: Record<string, Override> = {
  harry: {
    arpabet: "HH AE1 R IY0",
    reason: "CMUdict has HH EH1 R IY0 (/ˈhɛɹi/); the course material and most US speakers say /ˈhæɹi/.",
  },
  your: {
    arpabet: "Y ER0",
    reason: "CMUdict has the strong form Y AO1 R; in running speech 'your' is the weak form /jɚ/ (function word).",
  },
  amad: {
    arpabet: "AA1 M AA0 D",
    reason: "A name (Mr. Amad, nonfinal-2): not in CMUdict. Stress on the first syllable is our choice; it is not the nucleus of its group, so the contour does not depend on it.",
  },
};

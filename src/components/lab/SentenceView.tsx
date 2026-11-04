import { PATTERN_LABEL } from "@/lib/intonation/lessons";
import type { Sentence, Word } from "@/lib/intonation/types";

export function wordIpa(w: Word): string {
  return (
    "/" +
    w.syllables.map((s) => (s.stressed && w.syllables.length > 1 ? "ˈ" : "") + s.ipa).join(".") +
    "/"
  );
}

/** The sentence with IPA under every word, the nucleus syllable highlighted and | between thought groups. */
export function SentenceView({ sentence }: { sentence: Sentence }) {
  return (
    <div className="flex flex-wrap items-end gap-x-2 gap-y-4">
      {sentence.groups.map((g, gi) => (
        <div key={gi} className="flex items-end gap-x-2">
          {gi > 0 && <span className="pb-6 text-3xl font-black text-muted">|</span>}
          <div className="flex flex-col gap-1">
            <span className="w-fit rounded-full bg-accent-soft px-2 py-0.5 text-xs font-extrabold text-accent">
              {PATTERN_LABEL[g.pattern].en}
            </span>
            <div className="flex flex-wrap items-end gap-x-3">
              {g.words.map((w, wi) => (
                <div key={wi} className="flex flex-col items-center">
                  <span className="text-2xl font-bold sm:text-3xl">
                    {w.syllables.map((s, si) => {
                      const isNuc = g.nucleus.word === wi && g.nucleus.syllable === si;
                      // keep original spelling but highlight the nucleus chunk
                      return (
                        <span
                          key={si}
                          className={isNuc ? "rounded-md bg-primary px-0.5 text-primary-ink" : undefined}
                        >
                          {spellChunk(w, si)}
                        </span>
                      );
                    })}
                  </span>
                  <span className="ipa text-base text-muted sm:text-lg">{wordIpa(w)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Split the displayed word into syllable chunks; punctuation stays on the last chunk. */
function spellChunk(w: Word, si: number): string {
  const text = w.text;
  const letters = w.syllables.map((s) => s.text).join("");
  // When syllable chunks spell the word exactly (ignoring case/punctuation), reuse the real spelling.
  const core = text.replace(/[^A-Za-z']/g, "");
  if (core.toLowerCase() === letters.toLowerCase()) {
    let start = 0;
    for (let i = 0; i < si; i++) start += w.syllables[i].text.length;
    const chunk = core.slice(start, start + w.syllables[si].text.length);
    const tail = si === w.syllables.length - 1 ? text.slice(text.search(/[^A-Za-z']*$/)) : "";
    return chunk + tail;
  }
  return si === 0 ? text : "";
}

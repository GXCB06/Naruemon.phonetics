import { describe, expect, it } from "vitest";
import { dictionary } from "cmu-pronouncing-dictionary";
import { OVERRIDES } from "../ipa/overrides.ts";
import { buildWordIpa } from "../ipa/words.ts";
import type { WordIpa } from "../ipa/words.ts";
import { buildSentence, levelsForGroup, lessonWords, nucleusLabel } from "./buildLesson.ts";
import type { SentenceSource } from "./buildLesson.ts";
import { SENTENCES } from "./lessons.ts";

function tableFor(src: SentenceSource): Record<string, WordIpa> {
  const t: Record<string, WordIpa> = {};
  for (const w of lessonWords({ id: "x", unit: "u", sentences: [src] })) t[w] = buildWordIpa(w, dictionary, OVERRIDES);
  return t;
}
const build = (src: SentenceSource) => buildSentence(src, tableFor(src));

describe("levelsForGroup", () => {
  it("2 before the nucleus, 3 on it, 1 after", () => {
    expect(levelsForGroup(5, 2)).toEqual([[2], [2], [3], [1], [1]]);
    expect(levelsForGroup(3, 0)).toEqual([[3], [1], [1]]);
  });

  it("glides [3, 1] when the nucleus is the last syllable", () => {
    expect(levelsForGroup(4, 3)).toEqual([[2], [2], [2], [3, 1]]);
    expect(levelsForGroup(1, 0)).toEqual([[3, 1]]);
  });

  it("rejects an impossible nucleus", () => {
    expect(() => levelsForGroup(3, 3)).toThrow(/outside/);
    expect(() => levelsForGroup(3, -1)).toThrow(/outside/);
    expect(() => levelsForGroup(0, 0)).toThrow(/syllable count/);
  });

  it("reproduces the hand-written falling groups in lessons.ts", () => {
    const flat = (g: { words: { syllables: { levels: number[] }[] }[] }) => g.words.flatMap((w) => w.syllables.map((s) => s.levels));
    const falling = SENTENCES.flatMap((s) => s.groups).filter((g) => g.pattern === "2-3-1");
    expect(falling.length).toBeGreaterThanOrEqual(3);
    for (const g of falling) {
      const n = flat(g).length;
      let idx = 0;
      for (let i = 0; i < g.nucleus.word; i++) idx += g.words[i].syllables.length;
      idx += g.nucleus.syllable;
      expect(levelsForGroup(n, idx)).toEqual(flat(g));
    }
  });
});

describe("buildSentence", () => {
  it("rebuilds 'She is a pretty woman.' exactly like the hand-written lab sentence (IPA, chunks, stress, levels)", () => {
    const built = build({
      id: "fall-pretty-woman",
      text: "She is a pretty woman.",
      kind: "statement",
      nucleusWord: 4,
      spelling: { pretty: "pre-tty", woman: "wo-man" },
    });
    expect(built.groups).toEqual(SENTENCES.find((s) => s.id === "fall-pretty-woman")!.groups);
  });

  it("rebuilds 'What is your name?' (override for 'your', glide on a one-syllable nucleus)", () => {
    const built = build({ id: "fall-what-name", text: "What is your name?", kind: "wh", nucleusWord: 3 });
    expect(built.groups).toEqual(SENTENCES.find((s) => s.id === "fall-what-name")!.groups);
  });

  it("puts the nucleus on the primary-stress syllable of the last content word", () => {
    const s = build({ id: "t", text: "I won't go to work tomorrow.", kind: "statement", nucleusWord: 5, spelling: { tomorrow: "to-mor-row" } });
    expect(s.groups[0].nucleus).toEqual({ word: 5, syllable: 1 });
    expect(s.groups[0].words[5].syllables.map((y) => y.levels)).toEqual([[2], [3], [1]]);
  });

  it("is deterministic", () => {
    const src: SentenceSource = { id: "t", text: "Speak loudly.", kind: "command", nucleusWord: 1, spelling: { loudly: "loud-ly" } };
    expect(JSON.stringify(build(src))).toBe(JSON.stringify(build(src)));
  });

  it("fails loudly instead of guessing", () => {
    expect(() => build({ id: "t", text: "The table.", kind: "statement", nucleusWord: 1 })).toThrow(/spelling chunks/);
    expect(() => build({ id: "t", text: "The table.", kind: "statement", nucleusWord: 1, spelling: { table: "tab-le-x" } })).toThrow(/chunk/);
    expect(() => build({ id: "t", text: "The table.", kind: "statement", nucleusWord: 1, spelling: { table: "ta-bel" } })).toThrow(/does not spell/);
    expect(() => build({ id: "t", text: "Hello there.", kind: "statement", nucleusWord: 5 })).toThrow(/outside/);
    expect(() => buildSentence({ id: "t", text: "Zzxq.", kind: "statement", nucleusWord: 0 }, {})).toThrow(/no IPA/);
  });
});

describe("nucleusLabel", () => {
  it("marks which chunk of the word carries the peak", () => {
    expect(nucleusLabel(["name"], 0)).toBe("NAME");
    expect(nucleusLabel(["ta", "ble"], 0)).toBe("TA-");
    expect(nucleusLabel(["ar", "rive"], 1)).toBe("-RIVE");
    expect(nucleusLabel(["to", "mor", "row"], 1)).toBe("-MOR-");
  });
});

import { describe, expect, it } from "vitest";
import { dictionary } from "cmu-pronouncing-dictionary";
import { OVERRIDES } from "../ipa/overrides.ts";
import { buildWordIpa } from "../ipa/words.ts";
import type { WordIpa } from "../ipa/words.ts";
import { buildSentence, levelsForGroup, levelsForRisingGroup, lessonWords, nucleusLabel, patternForKind } from "./buildLesson.ts";
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

describe("levelsForRisingGroup", () => {
  it("2 before the nucleus, 3 on it, 3 after it, and the last syllable keeps rising slightly", () => {
    expect(levelsForRisingGroup(5, 2)).toEqual([[2], [2], [3], [3], [3, 3.4]]);
    expect(levelsForRisingGroup(2, 0)).toEqual([[2, 3], [3, 3.4]]);
  });

  it("glides up inside the nucleus when it is the last syllable", () => {
    expect(levelsForRisingGroup(4, 3)).toEqual([[2], [2], [2], [2.5, 3.4]]);
    expect(levelsForRisingGroup(1, 0)).toEqual([[2, 3.4]]);
  });

  it("rejects an impossible nucleus", () => {
    expect(() => levelsForRisingGroup(3, 3)).toThrow(/outside/);
    expect(() => levelsForRisingGroup(3, -1)).toThrow(/outside/);
    expect(() => levelsForRisingGroup(0, 0)).toThrow(/syllable count/);
  });

  it("reproduces the hand-written 2-3 groups in lessons.ts", () => {
    const flat = (g: { words: { syllables: { levels: number[] }[] }[] }) => g.words.flatMap((w) => w.syllables.map((s) => s.levels));
    const rising = SENTENCES.flatMap((s) => s.groups).filter((g) => g.pattern === "2-3");
    expect(rising.length).toBeGreaterThanOrEqual(2);
    for (const g of rising) {
      let idx = 0;
      for (let i = 0; i < g.nucleus.word; i++) idx += g.words[i].syllables.length;
      idx += g.nucleus.syllable;
      expect(levelsForRisingGroup(flat(g).length, idx)).toEqual(flat(g));
    }
  });
});

describe("buildSentence with several thought groups and the rising pattern", () => {
  const john: SentenceSource = {
    id: "t",
    text: "John, do you understand?",
    kind: "address",
    groupSizes: [1, 3],
    nucleusWord: [0, 3],
    spelling: { understand: "un-der-stand" },
  };

  it("builds one rising group per thought group, with the nucleus on each group's last content word", () => {
    const s = build(john);
    expect(s.kind).toBe("Direct address");
    expect(s.groups.map((g) => g.pattern)).toEqual(["2-3", "2-3"]);
    expect(s.groups.map((g) => g.words.map((w) => w.text))).toEqual([["John,"], ["do", "you", "understand?"]]);
    expect(s.groups[0].nucleus).toEqual({ word: 0, syllable: 0 });
    expect(s.groups[1].nucleus).toEqual({ word: 2, syllable: 2 }); // un-der-STAND
    expect(s.groups[0].words[0].syllables[0].levels).toEqual([2, 3.4]);
    expect(s.groups[1].words[2].syllables.map((y) => y.levels)).toEqual([[2], [2], [2.5, 3.4]]);
    expect(s.note.en).toContain("JOHN");
    expect(s.note.en).toContain("-STAND");
    expect(s.note.th).toContain("-STAND");
  });

  it("a yes/no question is one rising group; falling kinds still build one falling group", () => {
    const q = build({ id: "t", text: "Are you a student?", kind: "yesno", nucleusWord: 3, spelling: { student: "stu-dent" } });
    expect(q.groups.map((g) => g.pattern)).toEqual(["2-3"]);
    expect(build({ id: "t", text: "What is your name?", kind: "wh", nucleusWord: 3 }).groups[0].pattern).toBe("2-3-1");
    expect(patternForKind("statement")).toBe("2-3-1");
    expect(patternForKind("interjection")).toBe("2-3");
  });

  it("a single nucleusWord number still works for one group, and is deterministic", () => {
    const src: SentenceSource = { id: "t", text: "Do you play guitar?", kind: "yesno", nucleusWord: 3, spelling: { guitar: "gui-tar" } };
    expect(build(src).groups[0].nucleus).toEqual({ word: 3, syllable: 1 });
    expect(JSON.stringify(build(john))).toBe(JSON.stringify(build(john)));
  });

  it("fails loudly on a bad group split or nucleus", () => {
    expect(() => build({ ...john, groupSizes: [1, 2] })).toThrow(/do not add up/);
    expect(() => build({ ...john, nucleusWord: [0] })).toThrow(/need 2 nucleusWord/);
    expect(() => build({ ...john, nucleusWord: [2, 3] })).toThrow(/outside the 1 word/);
    expect(() => build({ ...john, nucleusWord: [0, 0] })).toThrow(/outside the 3 word/);
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

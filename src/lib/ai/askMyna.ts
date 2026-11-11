// Ask Myna: the AI tutor in Answer details. Pure part: request validation and the prompt. The route
// (src/app/api/ask-myna/route.ts) looks the sentence up itself and recomputes the grade, so a client can only ask about
// a real course sentence and its own drawing, never send its own instructions or sentence.

import type { Bilingual, Sentence } from "../intonation/types.ts";
import { drawGroupsOf, evaluateDrawing, PATTERN_INFO, syllableLabel, totalSyllables, type Levels } from "../learn/tuneDraw.ts";

export const ASK_LIMITS = { turns: 8, questionChars: 300, answerChars: 2000 };

export interface AskTurn {
  role: "user" | "assistant";
  content: string;
}
/** Which exercise the question is about. "draw" sends the learner's line; the others send no answer data. */
export type AskAbout = "draw" | "hear" | "meaning" | "match" | "peak" | "build";
export const ASK_ABOUT: readonly AskAbout[] = ["draw", "hear", "meaning", "match", "peak", "build"];

export interface AskRequest {
  sentenceId: string;
  assigned: (Levels | null)[];
  turns: AskTurn[];
  about: AskAbout;
}

const isLevels = (x: unknown): x is Levels =>
  Array.isArray(x) && (x.length === 1 || x.length === 2) && x.every((v) => Number.isInteger(v) && v >= 1 && v <= 4);

/** Check the shape of an Ask Myna request body. Returns the request or a short reason it was rejected. */
export function parseAskRequest(body: unknown): { ok: true; value: AskRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "body must be an object" };
  const b = body as Record<string, unknown>;
  if (typeof b.sentenceId !== "string" || !/^[a-z0-9-]{1,80}$/.test(b.sentenceId)) return { ok: false, error: "bad sentenceId" };
  if (!Array.isArray(b.assigned) || b.assigned.length > 80 || !b.assigned.every((x) => x === null || isLevels(x)))
    return { ok: false, error: "bad assigned levels" };
  if (!Array.isArray(b.turns) || b.turns.length === 0 || b.turns.length > ASK_LIMITS.turns) return { ok: false, error: "bad turns" };
  const turns: AskTurn[] = [];
  for (const t of b.turns as unknown[]) {
    const r = (t as Record<string, unknown> | null)?.role;
    const c = (t as Record<string, unknown> | null)?.content;
    if ((r !== "user" && r !== "assistant") || typeof c !== "string" || !c.trim()) return { ok: false, error: "bad turn" };
    if (c.length > (r === "user" ? ASK_LIMITS.questionChars : ASK_LIMITS.answerChars)) return { ok: false, error: "turn too long" };
    turns.push({ role: r, content: c.trim() });
  }
  if (turns[0].role !== "user" || turns[turns.length - 1].role !== "user") return { ok: false, error: "turns must start and end with the student" };
  const about = b.about === undefined ? "draw" : b.about;
  if (typeof about !== "string" || !ASK_ABOUT.includes(about as AskAbout)) return { ok: false, error: "bad about" };
  if (about !== "draw" && b.assigned.length !== 0) return { ok: false, error: "assigned is only for drawings" };
  return { ok: true, value: { sentenceId: b.sentenceId, assigned: b.assigned as (Levels | null)[], turns, about: about as AskAbout } };
}

const MYNA_RULES = `You are Myna, a warm, encouraging English intonation tutor for Thai learners (secondary school and university). Teach ONLY this course's system:
- Pitch levels: 1 low, 2 mid (normal speaking voice), 3 high, 4 extra high (strong feeling; not used in these lessons).
- A sentence is split into thought groups (marked |). Each group has ONE peak, the nucleus: the stressed syllable of the LAST content word (noun, main verb, adjective, adverb, wh-word, negative). Other words, especially function words (the, a, is, my, will, it), stay at 2.
- Patterns: 2-3-1 falling = finished (statements, commands, wh-questions). 2-3-2 non-final = more is coming (first part of a longer sentence, e.g. an if-clause). 2-3 rising = yes/no question, stays up at the end. Tag questions: sure = the tag falls 3-1; not sure = the tag rises 2-3.
- If the nucleus is the last syllable, the rise and the fall happen inside that one syllable (a glide, e.g. NAME 3→1).
The student drew a line over the sentence; the app turned it into a level for each syllable. The data below is the source of truth: never contradict the correct line or the rules above, and don't invent other systems (no "tones", no IPA unless asked).
How to answer:
- Answer the student's question about THIS sentence and THEIR line. Be concrete: name syllables in CAPITALS and levels by number.
- "en": at most 3 short sentences, under 70 words, simple words (CEFR A2-B1). Encourage, never scold. Plain text, no markdown or emoji.
- "th": the same answer in natural, friendly Thai. Myna has no gender: don't end sentences with ครับ or ค่ะ/คะ (a friendly นะ is fine).
- The student may write in Thai or English; always fill both fields.
- If the question is not about this sentence's pronunciation or intonation, say kindly (in both fields) that you can only help with that.`;

const lv = (x: Levels | null) => (x ? x.join("→") : "(not drawn)");

const DRAW_LINE = "The student drew a line over the sentence; the app turned it into a level for each syllable.";
const EXERCISE_LINE = "The student just answered a listening or reading exercise about this sentence wrong (described below) and tapped \"Why?\".";

/** The data block: the sentence, the correct and the drawn level of every syllable, every rule check and the grade. */
export function askContext(sentence: Sentence, assigned: readonly (Levels | null)[]): string {
  const groups = drawGroupsOf(sentence);
  const v = evaluateDrawing(groups, assigned);
  const text = groups.map((g) => g.syl.reduce((s, x, i) => s + (i && x.word !== g.syl[i - 1].word ? " " : "") + x.text, "")).join(" | ");
  const parts = v.reports
    .map((rep, gi) => {
      const sylls = rep.group.syl
        .map((s, si) => {
          const got = rep.mine[si];
          const same = got && got.join() === s.target.join();
          return `${syllableLabel(rep.group, si)} ${lv(s.target)} / ${lv(got)}${same ? "" : " (different)"}`;
        })
        .join("; ");
      const checks = rep.checks
        .slice()
        .sort((a, b) => a.ord - b.ord)
        .map((c) => `${c.ok ? "PASS" : "FAIL"} ${c.rule.en}: ${c.message.en}`)
        .join("\n    ");
      return `Part ${gi + 1}: pattern ${rep.group.pattern} (${PATTERN_INFO[rep.group.pattern].en}). Nucleus: ${syllableLabel(rep.group, rep.group.nucleus)}.
  Syllables (correct / student): ${sylls}
  Checks:
    ${checks}${rep.complete ? "" : "\n    (other checks skipped: this part is not fully drawn)"}`;
    })
    .join("\n");
  const grade = v.grade === "miss" ? "Not quite (a rule failed)." : v.grade === "perfect" ? "Perfect (every syllable matches the book)." : `Good (rules pass). ${v.diff?.en ?? ""}`;
  return `Sentence: "${text}" (${sentence.kind})
Course explanation: ${sentence.note.en}
${parts}
Result shown to the student: ${grade}`;
}

/** What the student was asked to do in each exercise type (they answered it wrong and tapped "Why?"). */
const EXERCISE_INFO: Record<Exclude<AskAbout, "draw">, string> = {
  hear: "Hear it: two clips of this sentence in the same synthetic voice, only the tune differs. The student had to pick the clip with the tune they were asked for, and picked the wrong one.",
  meaning: "Meaning match (tag question): the student heard the sentence and had to say whether the speaker is sure (falling tag 3-1) or really asking (rising tag 2-3), and chose wrong.",
  match: "Match the pairs: three clips of this sentence, one ends low (falls), one ends high (rises), one is flat with no peak. The student matched some of them wrong.",
  peak: "Find the peak: tap the nucleus (the peak syllable) of each thought group. The student tapped a wrong syllable.",
  build: "Build the tune: put level tiles in order for each thought group (for example 2-3-2 | 2-3-1). The student's order was wrong.",
};

/** The data block for a non-drawing exercise: the sentence and its correct tune, no student data. */
export function exerciseContext(sentence: Sentence, about: Exclude<AskAbout, "draw">): string {
  const groups = drawGroupsOf(sentence);
  const text = groups.map((g) => g.syl.reduce((s, x, i) => s + (i && x.word !== g.syl[i - 1].word ? " " : "") + x.text, "")).join(" | ");
  const parts = groups
    .map(
      (g, gi) =>
        `Part ${gi + 1}: pattern ${g.pattern} (${PATTERN_INFO[g.pattern].en}). Nucleus: ${syllableLabel(g, g.nucleus)}.
  Correct level of each syllable: ${g.syl.map((x, si) => `${syllableLabel(g, si)} ${lv(x.target)}`).join("; ")}`,
    )
    .join("\n");
  return `Exercise: ${EXERCISE_INFO[about]}
Sentence: "${text}" (${sentence.kind})
Course explanation: ${sentence.note.en}
Correct tune: ${groups.map((g) => g.pattern).join(" | ")}
${parts}`;
}

/** The system prompt for one Ask Myna request. Null when the drawing doesn't fit the sentence. */
export function askSystemPrompt(sentence: Sentence, assigned: readonly (Levels | null)[], about: AskAbout = "draw"): string | null {
  if (about !== "draw") {
    const rules = MYNA_RULES.replace(DRAW_LINE, EXERCISE_LINE).replace("about THIS sentence and THEIR line", "about THIS sentence and why the correct answer is right");
    return `${rules}\n\n--- Data ---\n${exerciseContext(sentence, about)}`;
  }
  if (assigned.length !== totalSyllables(drawGroupsOf(sentence))) return null;
  return `${MYNA_RULES}\n\n--- Data ---\n${askContext(sentence, assigned)}`;
}

/** Claude answers in this JSON shape (structured outputs), so English and Thai never get mixed up. */
export const ANSWER_SCHEMA = {
  type: "object",
  properties: { en: { type: "string" }, th: { type: "string" } },
  required: ["en", "th"],
  additionalProperties: false,
} as const;

/** Myna has no gender: drop polite particles a model may add anyway (ครับ, ค่ะ). คะ is left alone (it is part of คะแนน). */
export function neutralThai(th: string): string {
  return th
    .replace(/\s*(ครับ|ค่ะ)(?=[\s.!?,]|$)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function parseAnswer(text: string): Bilingual | null {
  try {
    const v = JSON.parse(text) as { en?: unknown; th?: unknown };
    if (typeof v.en === "string" && typeof v.th === "string" && v.en.trim()) return { en: v.en.trim(), th: neutralThai(v.th) };
  } catch {
    // fall through
  }
  return null;
}

import type { AnalysisResult } from "@/lib/intonation/types";
import type { Feedback } from "@/lib/learn/feedback";
import type { ExerciseOutcome } from "@/lib/learn/score";

/** What an exercise hands the player when the learner presses CHECK. */
export interface Checked {
  outcome: ExerciseOutcome;
  feedback: Feedback;
  /** The rule engine's result (draw it, shadow it only); the player saves it as an attempt. Numbers only, no audio. */
  analysis?: AnalysisResult;
}

/** How an exercise tells the player whether CHECK can be pressed, and what it does. Stable identity. */
export interface ExerciseApi {
  /** Pass a function once the learner has an answer; pass null when there is none (CHECK stays disabled). */
  setCheck: (fn: (() => Checked | null) | null) => void;
}

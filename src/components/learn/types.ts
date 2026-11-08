import type { Feedback } from "@/lib/learn/feedback";
import type { ExerciseOutcome } from "@/lib/learn/score";

/** What an exercise hands the player when the learner presses CHECK. */
export interface Checked {
  outcome: ExerciseOutcome;
  feedback: Feedback;
}

/** How an exercise tells the player whether CHECK can be pressed, and what it does. Stable identity. */
export interface ExerciseApi {
  /** Pass a function once the learner has an answer; pass null when there is none (CHECK stays disabled). */
  setCheck: (fn: (() => Checked | null) | null) => void;
}

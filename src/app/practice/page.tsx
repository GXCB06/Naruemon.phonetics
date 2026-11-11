import type { Metadata } from "next";
import { PracticeHub } from "@/components/practice/PracticeHub";

export const metadata: Metadata = {
  title: "Practice — Myna",
  description: "Pick a pattern to practise: draw 2-3-1, 2-3 or 2-3-2, lists, tag questions, a class sheet or a random quiz.",
};

// The shell is static; progress comes from localStorage, which only the client component reads (after hydration).
export default function PracticePage() {
  return <PracticeHub />;
}

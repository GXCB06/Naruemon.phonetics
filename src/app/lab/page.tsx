import type { Metadata } from "next";
import { SpeakHub } from "@/components/speak/SpeakHub";

export const metadata: Metadata = {
  title: "Speak — Melobi",
  description: "Pick a kind of sentence, say it aloud, and see your tune next to the target.",
};

// The shell is static; progress comes from localStorage, which only the client component reads (after hydration).
export default function SpeakPage() {
  return <SpeakHub />;
}

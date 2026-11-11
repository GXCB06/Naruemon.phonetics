import type { Metadata } from "next";
import { ReadAloud } from "@/components/read/ReadAloud";

export const metadata: Metadata = {
  title: "Read aloud — Myna",
  description: "Paste English text, hear it read with each word lit up, see the IPA, then read it yourself and get scored word by word.",
};

// The shell is static; the text, the scoring and the progress live in the browser.
export default function ReadPage() {
  return <ReadAloud />;
}

import type { Metadata } from "next";
import { ProgressScreen } from "@/components/progress/ProgressScreen";

export const metadata: Metadata = {
  title: "My Progress — Melobi",
  description: "See which intonation skills are strong and which to practise next.",
  robots: { index: false },
};

// The shell is static. Mastery and attempts come from localStorage (and Supabase when signed in), which only the
// client component reads, after hydration, so the first paint is a safe placeholder.
export default function ProgressPage() {
  return <ProgressScreen />;
}

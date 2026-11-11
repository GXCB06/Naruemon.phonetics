import type { Metadata } from "next";
import { Lab } from "@/components/lab/Lab";

// The original research lab (draw or say the 6 test sentences, raw numbers, Azure panel). Kept for the teacher and for
// tuning; learners use the Speak tab (/lab).
export const metadata: Metadata = { title: "Melobi lab — Phase 0a", robots: { index: false } };

export default function LabDevPage() {
  return <Lab />;
}

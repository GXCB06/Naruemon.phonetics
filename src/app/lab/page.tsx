import type { Metadata } from "next";
import { Lab } from "@/components/lab/Lab";

export const metadata: Metadata = { title: "Myna lab — Phase 0a" };

export default function LabPage() {
  return <Lab />;
}

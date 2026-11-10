import type { Metadata } from "next";
import { Onboarding } from "@/components/onboarding/Onboarding";

export const metadata: Metadata = {
  title: "How Myna works",
  description: "Pitch levels 1–4, drawing the tune on the sentence, and listening then speaking — in 4 short screens.",
};

export default function WelcomePage() {
  return <Onboarding />;
}

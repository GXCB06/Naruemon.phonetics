import type { Metadata } from "next";
import { IpaPractice } from "@/components/ipa/IpaPractice";

export const metadata: Metadata = {
  title: "IPA practice — Melobi",
  description: "Hear a word and build or write its American English IPA transcription.",
};

export default function IpaPage() {
  return <IpaPractice />;
}

import type { Metadata } from "next";
import { Noto_Sans, Noto_Sans_Thai, Nunito } from "next/font/google";
import "./globals.css";

const nunito = Nunito({ variable: "--nf-ui", subsets: ["latin"] });
// Noto Sans latin-ext covers the IPA Extensions block (ɪ ʃ ə ɚ ʊ ɹ ð ŋ) and stress marks (ˈ ˌ).
const notoIpa = Noto_Sans({ variable: "--nf-ipa", subsets: ["latin", "latin-ext"] });
const notoThai = Noto_Sans_Thai({ variable: "--nf-thai", subsets: ["thai"] });

export const metadata: Metadata = {
  title: "Myna — intonation coach",
  description: "Practise English intonation: say it or draw it, and see your pitch against the textbook pattern.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${nunito.variable} ${notoIpa.variable} ${notoThai.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

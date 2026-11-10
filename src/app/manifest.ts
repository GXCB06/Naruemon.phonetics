import type { MetadataRoute } from "next";

// Web app manifest: lets learners add Myna to the iPad/phone home screen and open it full screen like an app.
// Colours are the Myna tokens from globals.css (--bg paper, light theme). Icons: `node tools/make-icons.ts`.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Myna — intonation coach",
    short_name: "Myna",
    description: "Practise English intonation: listen, draw the tune on the sentence, then say it. ฝึกทำนองเสียงภาษาอังกฤษ",
    lang: "th",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#fffbf2",
    theme_color: "#fffbf2",
    categories: ["education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

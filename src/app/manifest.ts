import type { MetadataRoute } from "next";

// Web app manifest: lets learners add Melobi to the iPad/phone home screen and open it full screen like an app.
// Colours are the Melobi tokens from globals.css (--bg paper, light theme). Icons: `node tools/make-icons.ts`.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Melobi — intonation coach",
    short_name: "Melobi",
    description: "Practise English intonation: listen, draw the tune on the sentence, then say it. ฝึกทำนองเสียงภาษาอังกฤษ",
    lang: "th",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#15131f",
    theme_color: "#15131f",
    categories: ["education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

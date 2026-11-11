"use client";

import { pickUsVoice } from "@/components/ipa/useIpaSound";
import { prepareToPlay } from "@/components/audio/webAudio";
import { wordAtChar, type Token } from "@/lib/read/text";

/**
 * Read a sentence aloud with the device's US English voice and report which word is being said, so the page can highlight
 * it. Call inside the learner's tap (iPad). Most browsers report word positions; when none arrives in the first half second
 * (some do not), the words are lit in turn by an estimate of how long each takes. Returns a function that stops it.
 */
export function speakSentence(
  text: string,
  tokens: readonly Token[],
  opts: { rate: number; onWord: (index: number) => void; onEnd: () => void },
): () => void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    opts.onEnd();
    return () => undefined;
  }
  prepareToPlay(); // playback session: speech is muted by the silent switch otherwise (iPad)
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickUsVoice();
  if (voice) u.voice = voice;
  u.lang = "en-US";
  u.rate = opts.rate;

  let done = false;
  let gotBoundary = false;
  const timers: number[] = [];
  const finish = () => {
    if (done) return;
    done = true;
    timers.forEach((t) => window.clearTimeout(t));
    opts.onEnd();
  };

  u.onboundary = (e) => {
    if (e.name && e.name !== "word") return;
    gotBoundary = true;
    timers.forEach((t) => window.clearTimeout(t)); // real positions arrived: drop the estimate
    timers.length = 0;
    const i = wordAtChar(tokens, e.charIndex);
    if (i >= 0) opts.onWord(i);
  };
  u.onstart = () => {
    // no word positions after half a second: light the words by estimated time instead
    timers.push(
      window.setTimeout(() => {
        if (gotBoundary || done) return;
        const weights = tokens.map((t) => t.text.length + 2);
        const total = weights.reduce((a, b) => a + b, 0) || 1;
        const secs = (text.length * 0.07) / opts.rate; // about 14 characters a second at normal speed
        let at = 0;
        tokens.forEach((_, i) => {
          timers.push(window.setTimeout(() => !done && opts.onWord(i), (at / total) * secs * 1000));
          at += weights[i];
        });
      }, 500),
    );
  };
  u.onend = u.onerror = finish;
  synth.speak(u);
  return () => {
    synth.cancel();
    finish();
  };
}

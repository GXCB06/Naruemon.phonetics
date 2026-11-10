"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { soundOf, type IpaSound } from "@/lib/ipa/sounds";

/** Say a word with the device's US English voice (call inside the learner's tap). */
export function speakWord(word: string, rate: number, onState?: (speaking: boolean) => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(word);
  const voices = synth.getVoices().filter((v) => /^en[-_]US/i.test(v.lang));
  const pick = [/Samantha/i, /Ava/i, /Allison/i, /Google US English/i, /Jenny/i, /Aria/i].map((p) => voices.find((v) => p.test(v.name))).find(Boolean) ?? voices[0];
  if (pick) u.voice = pick;
  u.lang = "en-US";
  u.rate = rate;
  u.onstart = () => onState?.(true);
  u.onend = u.onerror = () => onState?.(false);
  synth.speak(u);
}

// Recorded sounds, if a teacher or tools/make-ipa-sounds.ts added them: public/audio/ipa/manifest.json lists the ids.
let manifest: Promise<Set<string>> | null = null;
function recordedIds(): Promise<Set<string>> {
  manifest ??= fetch("/audio/ipa/manifest.json", { cache: "force-cache" })
    .then((r) => (r.ok ? r.json() : { ids: [] }))
    .then((j: { ids?: unknown }) => new Set(Array.isArray(j.ids) ? j.ids.filter((x): x is string => typeof x === "string") : []))
    .catch(() => new Set<string>());
  return manifest;
}

export interface TileSound {
  symbol: string;
  sound: IpaSound;
  /** "clip" = the recorded sound itself; "word" = the key word in the device voice. */
  source: "clip" | "word";
}

/**
 * Tapping an IPA tile plays its sound: the recording when there is one, otherwise the key word ("think" for θ).
 * `last` is what was played most recently, for showing "θ as in think".
 */
export function useIpaSound(onSpeaking?: (speaking: boolean) => void) {
  const [last, setLast] = useState<TileSound | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const onSpeakingRef = useRef(onSpeaking);
  useEffect(() => {
    onSpeakingRef.current = onSpeaking;
  });
  // load the list of recordings ahead of time: on iPad, sound must start synchronously inside the tap
  const ids = useRef<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    void recordedIds().then((s) => {
      if (alive) ids.current = s;
    });
    return () => {
      alive = false;
      audio.current?.pause();
    };
  }, []);

  const play = useCallback((symbol: string) => {
    const sound = soundOf(symbol);
    if (!sound || sound.kind === "mark") return;
    const viaWord = () => {
      setLast({ symbol, sound, source: "word" });
      speakWord(sound.word, 0.8, (on) => onSpeakingRef.current?.(on));
    };
    if (!ids.current.has(sound.id)) return viaWord();
    audio.current?.pause();
    window.speechSynthesis?.cancel();
    const a = new Audio(`/audio/ipa/${sound.id}.mp3`);
    audio.current = a;
    a.onplay = () => onSpeakingRef.current?.(true);
    a.onended = a.onerror = () => onSpeakingRef.current?.(false);
    setLast({ symbol, sound, source: "clip" });
    a.play().catch(viaWord);
  }, []);

  return { play, last };
}

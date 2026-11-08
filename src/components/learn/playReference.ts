// Browser side of reference audio: play `/audio/<sentenceId>--f.mp3` when it exists, otherwise the synthetic
// placeholder voice (src/lib/learn/reference.ts), always through Web Audio at the device's native sample rate.
// Call `playReference` straight from a tap handler: the AudioContext is created/resumed before the first `await` (iOS).

import { endingOf, type ClipVariant } from "@/lib/learn/exercises";
import { placeholderClip, referenceUrl } from "@/lib/learn/reference";
import type { Sentence } from "@/lib/intonation/types";

export type ReferenceSource = "file" | "placeholder";

export interface Playing {
  source: ReferenceSource;
  /** Resolves when the clip ends or is stopped. */
  ended: Promise<void>;
}

let ctx: AudioContext | null = null;
let current: AudioBufferSourceNode | null = null;
/** Decoded reference files by sentence id; null = no file exists (so we don't ask the server twice). */
const files = new Map<string, AudioBuffer | null>();
const synth = new Map<string, AudioBuffer>();
/** Bumped on every play/stop so a clip that finished loading after a newer tap never starts. */
let token = 0;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx || ctx.state === "closed") {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor(); // native rate: never request 16 kHz
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

async function loadFile(c: AudioContext, sentenceId: string): Promise<AudioBuffer | null> {
  if (files.has(sentenceId)) return files.get(sentenceId) ?? null;
  let buf: AudioBuffer | null = null;
  try {
    const res = await fetch(referenceUrl(sentenceId));
    if (res.ok && (res.headers.get("content-type") ?? "").startsWith("audio")) {
      buf = await c.decodeAudioData(await res.arrayBuffer());
    }
  } catch {
    buf = null;
  }
  files.set(sentenceId, buf);
  return buf;
}

function placeholderBuffer(c: AudioContext, sentence: Sentence, variant: ClipVariant): AudioBuffer {
  const key = `${sentence.id}|${variant}`;
  let buf = synth.get(key);
  if (!buf) {
    const clip = placeholderClip(sentence, variant);
    buf = c.createBuffer(1, clip.samples.length, clip.sampleRate);
    buf.copyToChannel(clip.samples as Float32Array<ArrayBuffer>, 0);
    synth.set(key, buf);
  }
  return buf;
}

export function stopReference(): void {
  token++;
  const s = current;
  current = null;
  try {
    s?.stop();
  } catch {
    // already stopped
  }
}

/**
 * Play a sentence. The textbook variant (the one that ends the way the sentence should: "falling", or "rising" for 2-3 sentences; the default) uses the reference mp3 when there is one; the mistake variants
 * (used by "Hear it") and sentences without an mp3 use the placeholder voice. `forceSynth` skips the mp3 so that both
 * clips of a "Hear it" pair have the same voice. Throws when the browser has no Web Audio.
 */
export async function playReference(
  sentence: Sentence,
  opts: { variant?: ClipVariant; forceSynth?: boolean } = {},
): Promise<Playing> {
  const textbook = endingOf(sentence);
  const variant = opts.variant ?? textbook;
  const c = audioContext(); // before any await: still inside the user's tap
  if (!c) throw new Error("This browser can't play audio.");
  stopReference();
  const mine = token;

  let source: ReferenceSource = "placeholder";
  let buffer: AudioBuffer | null = null;
  if (variant === textbook && !opts.forceSynth) {
    buffer = await loadFile(c, sentence.id);
    if (buffer) source = "file";
  }
  if (mine !== token) return { source, ended: Promise.resolve() }; // a newer tap took over while the file loaded
  buffer ??= placeholderBuffer(c, sentence, variant);

  const node = c.createBufferSource();
  node.buffer = buffer;
  node.connect(c.destination);
  const ended = new Promise<void>((resolve) => {
    node.onended = () => {
      if (current === node) current = null;
      resolve();
    };
  });
  current = node;
  node.start();
  return { source, ended };
}

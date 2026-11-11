// Browser side of reference audio: play the real clip `/audio/<sentenceId>--<f|m>.mp3` when manifest.json lists it,
// otherwise the synthetic placeholder voice (src/lib/learn/reference.ts), always through Web Audio at the device's native
// sample rate. Call `playReference` straight from a tap handler: the AudioContext is created/resumed before the first
// `await` (iOS). The manifest is fetched once per page load.

import { endingOf, type ClipVariant } from "@/lib/learn/exercises";
import {
  EMPTY_MANIFEST,
  MANIFEST_URL,
  parseManifest,
  pickReferenceVoice,
  placeholderClip,
  referenceUrl,
  type ReferenceManifest,
  type ReferenceVoice,
} from "@/lib/learn/reference";
import type { Sentence } from "@/lib/intonation/types";
import { prepareToPlay } from "@/components/audio/webAudio";
import { clipRate } from "@/lib/learn/slow";
import { getSlow } from "./slow";
import { EMPTY_VARIANTS, VARIANT_MANIFEST_URL, hasRealVariants, parseVariantManifest, variantUrl, type VariantManifest } from "@/lib/synth/variants";

export type ReferenceSource = "file" | "placeholder";

export interface Playing {
  source: ReferenceSource;
  /** Which voice played, when it was a real clip. */
  voice: ReferenceVoice | null;
  /** The other voice, when it has a clip too (offer "hear the other voice"). */
  alternative: ReferenceVoice | null;
  /** Resolves when the clip ends or is stopped. */
  ended: Promise<void>;
}

let current: AudioBufferSourceNode | null = null;
let manifest: Promise<ReferenceManifest> | null = null;
/** Fetched mp3 bytes by url (may be prefetched before the tap); null = the file failed to load. */
const bytes = new Map<string, Promise<ArrayBuffer | null>>();
/** Decoded clips by url. */
const files = new Map<string, AudioBuffer | null>();
const synth = new Map<string, AudioBuffer>();
/** Bumped on every play/stop so a clip that finished loading after a newer tap never starts. */
let token = 0;

/** manifest.json, fetched once. A missing or broken manifest means "no real clips". */
export function loadManifest(): Promise<ReferenceManifest> {
  manifest ??= fetch(MANIFEST_URL)
    .then((res) => (res.ok ? res.json() : null))
    .then(parseManifest)
    .catch(() => EMPTY_MANIFEST);
  return manifest;
}

let variantManifest: Promise<VariantManifest> | null = null;

/** Real-voice practice clips (public/audio/variants/manifest.json), fetched once. Missing or broken = none. */
export function loadVariantManifest(): Promise<VariantManifest> {
  variantManifest ??= fetch(VARIANT_MANIFEST_URL)
    .then((res) => (res.ok ? res.json() : null))
    .then(parseVariantManifest)
    .catch(() => EMPTY_VARIANTS);
  return variantManifest;
}

/** Start downloading the real clips of an exercise before the tap (only if all of them exist). Starts no audio. */
export async function prefetchVariants(sentence: Sentence, variants: readonly ClipVariant[]): Promise<void> {
  if (hasRealVariants(await loadVariantManifest(), sentence.id, variants)) for (const v of variants) void fetchBytes(variantUrl(sentence.id, v));
}

const VOICE_KEY = "myna.referenceVoice";

/** The voice the learner picked last ("f" by default). Per device, a convenience only. */
export function preferredVoice(): ReferenceVoice {
  try {
    return window.localStorage.getItem(VOICE_KEY) === "m" ? "m" : "f";
  } catch {
    return "f";
  }
}

export function setPreferredVoice(voice: ReferenceVoice): void {
  try {
    window.localStorage.setItem(VOICE_KEY, voice);
  } catch {
    // private mode: the choice just isn't remembered
  }
}

function fetchBytes(url: string): Promise<ArrayBuffer | null> {
  let p = bytes.get(url);
  if (!p) {
    p = fetch(url)
      .then((res) => (res.ok && (res.headers.get("content-type") ?? "").startsWith("audio") ? res.arrayBuffer() : null))
      .catch(() => null);
    bytes.set(url, p);
  }
  return p;
}

/** Start downloading a sentence's clip before the learner taps, so playback starts at once. Starts no audio. */
export async function prefetchReference(sentence: Sentence, fairWith: readonly string[] = []): Promise<void> {
  const voice = pickReferenceVoice(await loadManifest(), sentence.id, preferredVoice(), fairWith);
  if (voice) void fetchBytes(referenceUrl(sentence.id, voice));
}

async function loadFile(c: AudioContext, url: string): Promise<AudioBuffer | null> {
  if (files.has(url)) return files.get(url) ?? null;
  let buf: AudioBuffer | null = null;
  try {
    const data = await fetchBytes(url);
    // decodeAudioData detaches its input: decode a copy so the cached bytes stay usable
    if (data) buf = await c.decodeAudioData(data.slice(0));
  } catch {
    buf = null;
  }
  files.set(url, buf);
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
 * Play a sentence. The textbook variant (the one that ends the way the sentence should: "falling", or "rising" for 2-3
 * sentences; the default) uses the real clip when the manifest lists one; the mistake variants (used by "Hear it") and
 * sentences without a clip use the placeholder voice. `forceSynth` skips the clip so both clips of a "Hear it" pair have
 * the same voice. `fairWith`: sentence ids that must have a clip in the same voice too, else the placeholder plays (see
 * `pickReferenceVoice`). `voice` overrides the learner's preferred voice. Throws when the browser has no Web Audio.
 */
export async function playReference(
  sentence: Sentence,
  opts: {
    variant?: ClipVariant;
    forceSynth?: boolean;
    fairWith?: readonly string[];
    voice?: ReferenceVoice;
    /**
     * Every clip this exercise plays (e.g. both clips of a "Hear it" pair). When all of them exist as real-voice clips,
     * `variant` plays the real clip; if even one is missing the synthetic voice plays for all of them, so a real voice never
     * sits next to the synthetic one.
     */
    realVariants?: readonly ClipVariant[];
    /** Playback speed (1 = normal). Default: the 🐢 Slow setting. */
    rate?: number;
  } = {},
): Promise<Playing> {
  const textbook = endingOf(sentence);
  const variant = opts.variant ?? textbook;
  const c = prepareToPlay(); // before any await: still inside the user's tap (shared context, playback session, resume)
  if (!c) throw new Error("This browser can't play audio.");
  stopReference();
  const mine = token;

  let source: ReferenceSource = "placeholder";
  let voice: ReferenceVoice | null = null;
  let alternative: ReferenceVoice | null = null;
  let buffer: AudioBuffer | null = null;
  if (opts.realVariants) {
    const vm = await loadVariantManifest();
    if (hasRealVariants(vm, sentence.id, [...opts.realVariants, variant])) {
      buffer = await loadFile(c, variantUrl(sentence.id, variant));
      if (buffer) source = "file";
    }
  } else if (variant === textbook && !opts.forceSynth) {
    const m = await loadManifest();
    voice = pickReferenceVoice(m, sentence.id, opts.voice ?? preferredVoice(), opts.fairWith);
    const other = voice === "f" ? "m" : "f";
    alternative = voice && pickReferenceVoice(m, sentence.id, other, opts.fairWith) === other ? other : null;
    if (voice) buffer = await loadFile(c, referenceUrl(sentence.id, voice));
    if (buffer) source = "file";
    else voice = alternative = null;
  }
  if (mine !== token) return { source, voice, alternative, ended: Promise.resolve() }; // a newer tap took over while the file loaded
  buffer ??= placeholderBuffer(c, sentence, variant);

  const node = c.createBufferSource();
  node.buffer = buffer;
  node.playbackRate.value = opts.rate ?? clipRate(getSlow());
  node.connect(c.destination);
  const ended = new Promise<void>((resolve) => {
    node.onended = () => {
      if (current === node) current = null;
      resolve();
    };
  });
  current = node;
  node.start();
  return { source, voice, alternative, ended };
}

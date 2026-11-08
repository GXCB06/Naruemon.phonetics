import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { encodeWav } from "../audio/wav.ts";
import { createPronunciationConfig } from "./assess.ts";
import { parseAzureResult } from "./parse.ts";
import { toWavPcm16 } from "./pcm.ts";
import { clientIp, createRateLimiter, createTokenCache, isValidRegion, tokenEndpoint, TOKEN_TTL_MS } from "./token.ts";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8"));

describe("parseAzureResult", () => {
  it("parses a good take: scores, words, syllables, phonemes with seconds", () => {
    const a = parseAzureResult(fixture("good-i-need-a-pen.json"));
    expect(a.status).toBe("Success");
    expect(a.prosodyScore).toBeCloseTo(91.3);
    expect(a.accuracy).toBeCloseTo(97.5);
    expect(a.fluency).toBe(99);
    expect(a.completeness).toBe(100);
    expect(a.pronScore).toBeCloseTo(94.8);
    expect(a.words.map((w) => w.word)).toEqual(["I", "need", "a", "pen"]);
    expect(a.monotone).toBe(false);
    expect(a.breaks).toEqual([]);
    expect(a.words.every((w) => w.errorType === "None")).toBe(true);

    const need = a.words[1];
    expect(need.syllables).toHaveLength(1);
    expect(need.syllables[0].ipa).toBe("nid");
    expect(need.phonemes.map((p) => p.ipa)).toEqual(["n", "i", "d"]);
    expect(need.phonemes[0].nbest).toHaveLength(5);
    expect(need.phonemes[0].nbest[0]).toEqual({ ipa: "n", score: 99 });
  });

  it("converts 100-ns ticks to seconds", () => {
    const a = parseAzureResult(fixture("good-i-need-a-pen.json"));
    expect(a.words[0].offsetSec).toBeCloseTo(0.5, 6); // 5_000_000 ticks
    expect(a.words[0].durationSec).toBeCloseTo(0.14, 6); // 1_400_000 ticks
    // syllables and phonemes tile their word
    const w = a.words[3];
    expect(w.syllables[0].offsetSec).toBeCloseTo(w.offsetSec, 6);
    expect(w.syllables[0].durationSec).toBeCloseTo(w.durationSec, 6);
    const last = w.phonemes[w.phonemes.length - 1];
    expect(last.offsetSec! + last.durationSec!).toBeCloseTo(w.offsetSec + w.durationSec, 6);
    // words are in time order
    for (let i = 1; i < a.words.length; i++) expect(a.words[i].offsetSec).toBeGreaterThan(a.words[i - 1].offsetSec);
  });

  it("flags Monotone, the missed final consonant and a missing break", () => {
    const a = parseAzureResult(fixture("monotone-missed-n.json"));
    expect(a.monotone).toBe(true);
    expect(a.prosodyScore).toBeCloseTo(44.6);
    const pen = a.words[3];
    expect(pen.errorType).toBe("Mispronunciation");
    expect(pen.accuracy).toBe(52);
    const n = pen.phonemes[2];
    expect(n.accuracy).toBe(0);
    expect(n.nbest[0].ipa).toBe("ə"); // what Azure heard instead of the "n"
    // words that were otherwise fine are tagged Monotone (Azure tags every word)
    expect(a.words[0].errorType).toBe("Monotone");
    expect(a.breaks).toEqual([{ wordIndex: 1, type: "missing", confidence: 0.81 }]);
  });

  it("accepts a JSON string as the SDK returns it", () => {
    const a = parseAzureResult(JSON.stringify(fixture("good-i-need-a-pen.json")));
    expect(a.words).toHaveLength(4);
  });

  it("tolerates missing fields and junk", () => {
    for (const junk of [undefined, null, 42, "not json", [], {}, { NBest: [] }, { NBest: [{}] }]) {
      const a = parseAzureResult(junk);
      expect(a.words).toEqual([]);
      expect(a.prosodyScore).toBeNull();
      expect(a.monotone).toBe(false);
    }
    const sparse = parseAzureResult({
      RecognitionStatus: "Success",
      NBest: [{ Words: [{ Word: "hi" }, { Word: "there", Syllables: [{}], Phonemes: [{ PronunciationAssessment: {} }] }] }],
    });
    expect(sparse.words).toHaveLength(2);
    expect(sparse.words[0]).toMatchObject({ word: "hi", accuracy: null, errorType: "None", offsetSec: 0, syllables: [], phonemes: [] });
    expect(sparse.words[1].syllables[0]).toMatchObject({ ipa: "", accuracy: null, durationSec: 0 });
    expect(sparse.words[1].phonemes[0]).toMatchObject({ ipa: "", accuracy: null, nbest: [], offsetSec: null });
  });

  it("reports Azure's failure status", () => {
    expect(parseAzureResult({ RecognitionStatus: "NoMatch" }).status).toBe("NoMatch");
  });

  it("detects a break from its error type even without a confidence", () => {
    const a = parseAzureResult({
      NBest: [{ Words: [{ Word: "a", PronunciationAssessment: { Feedback: { Prosody: { Break: { ErrorTypes: ["UnexpectedBreak"] } } } } }] }],
    });
    expect(a.breaks).toEqual([{ wordIndex: 0, type: "unexpected", confidence: 1 }]);
  });
});

describe("toWavPcm16", () => {
  it("strips the 44-byte header and keeps the samples", () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const wav = encodeWav(samples, 16000);
    const pcm = toWavPcm16(wav);
    expect(pcm.byteLength).toBe(wav.byteLength - 44);
    expect(Array.from(pcm)).toEqual(Array.from(wav.subarray(44)));
  });

  it("walks extra chunks before the data chunk", () => {
    const wav = encodeWav(new Float32Array([0.25, -0.25, 0.1]), 16000);
    // insert a 6-byte LIST chunk between fmt and data
    const list = new Uint8Array([76, 73, 83, 84, 6, 0, 0, 0, 1, 2, 3, 4, 5, 6]);
    const padded = new Uint8Array(wav.length + list.length);
    padded.set(wav.subarray(0, 36));
    padded.set(list, 36);
    padded.set(wav.subarray(36), 36 + list.length);
    expect(Array.from(toWavPcm16(padded))).toEqual(Array.from(wav.subarray(44)));
  });

  it("works on a subarray view", () => {
    const wav = encodeWav(new Float32Array([0.5, -0.5]), 16000);
    const big = new Uint8Array(wav.length + 10);
    big.set(wav, 7);
    expect(Array.from(toWavPcm16(big.subarray(7, 7 + wav.length)))).toEqual(Array.from(wav.subarray(44)));
  });

  it("rejects other sample rates and non-WAV data", () => {
    expect(() => toWavPcm16(encodeWav(new Float32Array(10), 44100))).toThrow(/16 kHz/);
    expect(() => toWavPcm16(new Uint8Array(100))).toThrow(/Not a WAV/);
  });
});

describe("rate limiter", () => {
  it("allows up to the limit per window, then says when to retry", () => {
    const rl = createRateLimiter({ limit: 3, windowMs: 60_000 });
    expect(rl.hit("a", 0).ok).toBe(true);
    expect(rl.hit("a", 1000).ok).toBe(true);
    expect(rl.hit("a", 2000).ok).toBe(true);
    const blocked = rl.hit("a", 3000);
    expect(blocked).toEqual({ ok: false, retryAfterSec: 57 });
    expect(rl.hit("b", 3000).ok).toBe(true); // other IPs unaffected
    expect(rl.hit("a", 60_000).ok).toBe(true); // new window
  });

  it("does not grow without bound", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 10 });
    for (let i = 0; i < 100; i++) expect(rl.hit(`ip${i}`, 0).ok).toBe(true);
  });
});

describe("token helpers", () => {
  it("caches for about nine minutes", () => {
    const c = createTokenCache();
    expect(c.get(0)).toBeNull();
    c.set("tok", 1000);
    expect(c.get(1000 + TOKEN_TTL_MS - 1)).toBe("tok");
    expect(c.get(1000 + TOKEN_TTL_MS)).toBeNull();
    expect(TOKEN_TTL_MS).toBe(9 * 60_000);
  });

  it("only accepts plain region names and builds the endpoint", () => {
    expect(isValidRegion("southeastasia")).toBe(true);
    expect(isValidRegion("evil.com/x")).toBe(false);
    expect(isValidRegion("a@b")).toBe(false);
    expect(isValidRegion("")).toBe(false);
    expect(isValidRegion(undefined)).toBe(false);
    expect(tokenEndpoint("eastus")).toBe("https://eastus.api.cognitive.microsoft.com/sts/v1.0/issueToken");
  });

  it("reads the client IP from proxy headers", () => {
    const h = (o: Record<string, string>) => new Headers(o);
    expect(clientIp(h({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientIp(h({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientIp(h({}))).toBe("unknown");
  });
});

describe("pronunciation config (needs the SDK, no network)", () => {
  it("asks Azure for IPA phonemes, n-best 5, miscue and prosody", async () => {
    const sdk = await import("microsoft-cognitiveservices-speech-sdk");
    const json = JSON.parse(createPronunciationConfig(sdk, "I need a pen.").toJSON());
    expect(json).toMatchObject({
      referenceText: "I need a pen.",
      gradingSystem: "HundredMark",
      granularity: "Phoneme",
      phonemeAlphabet: "IPA",
      nbestPhonemeCount: 5,
      enableMiscue: true,
      enableProsodyAssessment: true,
    });
  });
});

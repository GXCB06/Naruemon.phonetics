// Client-side pronunciation assessment with Azure AI Speech. Browser only: needs a token from /api/speech-token.
// The Speech SDK is imported lazily so it stays out of the first-load bundle.
import { parseAzureResult, type AzureAssessment } from "./parse.ts";
import { toWavPcm16 } from "./pcm.ts";

type Sdk = typeof import("microsoft-cognitiveservices-speech-sdk");

export type AzureErrorCode = "canceled" | "no_match" | "timeout" | "bad_result" | "bad_audio";

export class AzureAssessError extends Error {
  code: AzureErrorCode;
  constructor(code: AzureErrorCode, message: string) {
    super(message);
    this.name = "AzureAssessError";
    this.code = code;
  }
}

/**
 * Builds the assessment config.
 *
 * Differences from SPEC.md B2, per Microsoft's current docs and the SDK typings (v1.53):
 * - We use the constructor + setters instead of `fromJSON`. The SDK documents `fromJSON` as the route for parameters
 *   "still in preview", and its `applyTo` overwrites `enableProsodyAssessment` with the setter's value (unset when using
 *   `fromJSON`), so prosody could not be switched on through the JSON.
 * - The setters are named `nbestPhonemeCount` (lowercase b) and `enableProsodyAssessment` (a property setter; the docs
 *   page's snippet shows a method call). Prosody scoring is en-US only and needs SDK 1.35 or later.
 */
export function createPronunciationConfig(sdk: Sdk, referenceText: string) {
  const config = new sdk.PronunciationAssessmentConfig(
    referenceText,
    sdk.PronunciationAssessmentGradingSystem.HundredMark,
    sdk.PronunciationAssessmentGranularity.Phoneme,
    true, // enableMiscue
  );
  config.phonemeAlphabet = "IPA";
  config.nbestPhonemeCount = 5;
  config.enableProsodyAssessment = true;
  return config;
}

export async function assessPronunciation(opts: {
  /** 16 kHz mono 16-bit WAV, e.g. `analyzeVoice().wav16k`. */
  wav16k: Uint8Array;
  referenceText: string;
  token: string;
  region: string;
  /** Give up after this long (default 20 s). */
  timeoutMs?: number;
}): Promise<AzureAssessment> {
  let pcm: Uint8Array;
  try {
    pcm = toWavPcm16(opts.wav16k);
  } catch (e) {
    throw new AzureAssessError("bad_audio", e instanceof Error ? e.message : "Bad audio");
  }
  const mod = await import("microsoft-cognitiveservices-speech-sdk");
  const sdk: Sdk = (mod as unknown as { default?: Sdk }).default ?? mod;

  const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(opts.token, opts.region);
  speechConfig.speechRecognitionLanguage = "en-US";

  const stream = sdk.AudioInputStream.createPushStream(sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1));
  // Copy into a standalone ArrayBuffer: `pcm` is a view into the WAV, and the SDK keeps the buffer it is given.
  stream.write(pcm.slice().buffer);
  stream.close();

  const recognizer = new sdk.SpeechRecognizer(speechConfig, sdk.AudioConfig.fromStreamInput(stream));
  createPronunciationConfig(sdk, opts.referenceText).applyTo(recognizer);

  try {
    const result = await new Promise<InstanceType<Sdk["SpeechRecognitionResult"]>>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new AzureAssessError("timeout", "Azure took too long to answer")),
        opts.timeoutMs ?? 20_000,
      );
      recognizer.recognizeOnceAsync(
        (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        (err) => {
          clearTimeout(timer);
          reject(new AzureAssessError("canceled", String(err)));
        },
      );
    });

    if (result.reason === sdk.ResultReason.Canceled) {
      const d = sdk.CancellationDetails.fromResult(result);
      throw new AzureAssessError("canceled", d.errorDetails || "Azure canceled the request");
    }
    if (result.reason === sdk.ResultReason.NoMatch) throw new AzureAssessError("no_match", "Azure heard no speech");
    const raw = result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult);
    if (!raw) throw new AzureAssessError("bad_result", "Azure returned no result JSON");
    return parseAzureResult(raw);
  } finally {
    recognizer.close();
  }
}

// Server-only: one JSON-answer call for the app's AI features (Ask Myna, reading handwritten IPA), through Claude or Gemini.
// Which provider: AI_PROVIDER ("claude" | "gemini") if set, otherwise whichever key exists (Claude first). Keys stay on the
// server; without any key every AI route answers 501 and the app hides the features. Not pure (network): never import
// this from client components.

import Anthropic from "@anthropic-ai/sdk";
import { ApiError, GoogleGenAI, ThinkingLevel, type Content, type Part } from "@google/genai";

export const CLAUDE_MODEL = "claude-opus-5-5";
/**
 * Gemini models to try, in order: when one is busy (503), out of quota (429) or too slow, the next one answers.
 * Free-tier Flash models are often overloaded at peak times. In tests (2026-11) Flash-Lite read handwriting correctly
 * and fastest, so reading ("fast") starts there; Ask Myna ("quality") starts with Flash, whose explanations were better.
 * GEMINI_MODEL (comma-separated) replaces both lists.
 */
export const GEMINI_MODELS = {
  fast: ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-3.7-flash"],
  quality: ["gemini-3.5-flash", "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"],
};
export const DEFAULT_GEMINI_MODEL = GEMINI_MODELS.fast[0];
const GEMINI_ATTEMPT_MS = 25_000;
const GEMINI_TOTAL_MS = 75_000;

export function geminiModels(tier: "fast" | "quality" = "fast"): string[] {
  const own = (process.env.GEMINI_MODEL ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return own.length ? own : GEMINI_MODELS[tier];
}

export type AiProvider = "claude" | "gemini";

export function aiProvider(): AiProvider | null {
  const want = process.env.AI_PROVIDER?.trim().toLowerCase();
  const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  if (want === "gemini") return hasGemini ? "gemini" : null;
  if (want === "claude") return hasClaude ? "claude" : null;
  return hasClaude ? "claude" : hasGemini ? "gemini" : null;
}

export function aiConfigured(): boolean {
  return aiProvider() !== null;
}

export interface AiRequest {
  system?: string;
  /** The conversation, oldest first, starting and ending with the user. */
  turns: { role: "user" | "assistant"; content: string }[];
  /** A PNG (base64, no data: prefix) shown with the LAST user turn. */
  png?: string;
  /** JSON schema of the answer. */
  schema: Record<string, unknown>;
  effort: "low" | "medium" | "high";
  maxTokens: number;
  /** Gemini only: "fast" tries the quickest models first, "quality" the stronger ones. */
  tier?: "fast" | "quality";
}

export type AiResult = { ok: true; text: string; provider: AiProvider } | { ok: false; reason: "refused" | "rate_limited" | "upstream" | "empty" | "not_configured" };

export async function aiJson(req: AiRequest, provider: AiProvider | null = aiProvider()): Promise<AiResult> {
  if (provider === "claude") return claudeJson(req);
  if (provider === "gemini") return geminiJson(req);
  return { ok: false, reason: "not_configured" };
}

// ---- Claude: Opus 5.5 with server-side refusal fallbacks and structured outputs ----

let claude: Anthropic | null = null;

async function claudeJson(req: AiRequest): Promise<AiResult> {
  claude ??= new Anthropic({ maxRetries: 1, timeout: 60_000 });
  const last = req.turns.length - 1;
  const messages: Anthropic.Beta.BetaMessageParam[] = req.turns.map((t, i) =>
    i === last && req.png
      ? {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: req.png } },
            { type: "text", text: t.content },
          ],
        }
      : { role: t.role, content: t.content },
  );
  try {
    const res = await claude.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: req.maxTokens,
      ...(req.system ? { system: req.system } : {}),
      messages,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: req.effort, format: { type: "json_schema", schema: req.schema } },
    });
    if (res.stop_reason === "refusal") return { ok: false, reason: "refused" };
    // keep only what follows the last fallback switch point
    const lastSwitch = res.content.map((b) => b.type).lastIndexOf("fallback");
    const text = res.content
      .slice(lastSwitch + 1)
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("");
    return text.trim() ? { ok: true, text, provider: "claude" } : { ok: false, reason: "empty" };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false, reason: "rate_limited" };
    if (e instanceof Anthropic.APIError) {
      // log the status only: never the key, the prompt or the student's text
      console.error(`claude request failed: ${e.status ?? "connection"}`);
      return { ok: false, reason: "upstream" };
    }
    throw e;
  }
}

// ---- Gemini: JSON-schema output, thinking level from the effort ----

let gemini: GoogleGenAI | null = null;
const GEMINI_THINKING: Record<AiRequest["effort"], ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

async function geminiJson(req: AiRequest): Promise<AiResult> {
  gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const last = req.turns.length - 1;
  const contents: Content[] = req.turns.map((t, i) => {
    const parts: Part[] = [];
    if (i === last && req.png) parts.push({ inlineData: { mimeType: "image/png", data: req.png } });
    parts.push({ text: t.content });
    return { role: t.role === "assistant" ? "model" : "user", parts };
  });
  const deadline = Date.now() + GEMINI_TOTAL_MS;
  let outcome: AiResult = { ok: false, reason: "upstream" };
  for (const model of geminiModels(req.tier)) {
    const left = deadline - Date.now();
    if (left < 5_000) break;
    try {
      const res = await gemini.models.generateContent({
        model,
        contents,
        config: {
          ...(req.system ? { systemInstruction: req.system } : {}),
          responseMimeType: "application/json",
          responseJsonSchema: req.schema,
          maxOutputTokens: req.maxTokens,
          thinkingConfig: { thinkingLevel: GEMINI_THINKING[req.effort] },
          abortSignal: AbortSignal.timeout(Math.min(GEMINI_ATTEMPT_MS, left)),
        },
      });
      const blocked = res.promptFeedback?.blockReason || res.candidates?.[0]?.finishReason === "SAFETY";
      if (blocked) return { ok: false, reason: "refused" };
      const text = res.text ?? "";
      if (text.trim()) return { ok: true, text, provider: "gemini" };
      outcome = { ok: false, reason: "empty" };
    } catch (e) {
      if (e instanceof ApiError) {
        // log the model and status only: never the key, the prompt or the student's text
        console.error(`gemini ${model} failed: ${e.status}`);
        // busy, out of quota or unavailable: try the next model; anything else (bad request) won't get better
        if (![429, 500, 503, 504, 404].includes(e.status)) return { ok: false, reason: "upstream" };
        outcome = { ok: false, reason: e.status === 429 ? "rate_limited" : "upstream" };
        continue;
      }
      if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
        console.error(`gemini ${model} timed out`);
        outcome = { ok: false, reason: "upstream" };
        continue;
      }
      throw e;
    }
  }
  return outcome;
}

/** Browsers send Origin on POST: refuse calls from other sites so they can't spend the key. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // same-origin fetches from older browsers, server-to-server tests
  try {
    return new URL(origin).host === new URL(request.url).host || new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

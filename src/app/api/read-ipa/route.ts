import { aiConfigured, aiJson, sameOrigin } from "../../../lib/ai/aiServer.ts";
import { parseReading, parseReadRequest, READ_PROMPT, READ_SCHEMA } from "../../../lib/ai/readIpa.ts";
import { clientIp, createRateLimiter } from "../../../lib/azure/token.ts";

// Reads a student's handwritten IPA (IPA practice, Write mode) and returns what is written: { ipa, unsure }.
// The image is sent to the AI provider (Claude or Gemini, see src/lib/ai/aiServer.ts) for this one request and is not
// stored by the app. GET tells the page whether the feature is on.

const NO_STORE = { "Cache-Control": "no-store" };
const limiter = createRateLimiter({ limit: 12, windowMs: 60_000 });

function json(body: unknown, status: number, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...NO_STORE, ...extra } });
}

export function GET() {
  return json({ enabled: aiConfigured() }, 200);
}

export async function POST(request: Request) {
  if (!aiConfigured()) return json({ error: "ai_not_configured" }, 501);
  if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
  const hit = limiter.hit(clientIp(request.headers), Date.now());
  if (!hit.ok) return json({ error: "rate_limited" }, 429, { "Retry-After": String(hit.retryAfterSec) });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const parsed = parseReadRequest(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const r = await aiJson({
    turns: [{ role: "user", content: READ_PROMPT }],
    png: parsed.png,
    schema: READ_SCHEMA,
    // reading handwriting is where care pays off: a misread symbol becomes a wrong answer the student didn't write
    effort: "high",
    maxTokens: 8000,
    tier: "fast",
  });
  if (!r.ok) return json({ error: r.reason }, r.reason === "rate_limited" ? 429 : r.reason === "refused" ? 422 : 502);
  const reading = parseReading(r.text);
  if (!reading) return json({ error: "empty" }, 502);
  return json(reading, 200);
}

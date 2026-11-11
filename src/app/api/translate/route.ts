import { aiConfigured, aiJson, sameOrigin } from "../../../lib/ai/aiServer.ts";
import { clientIp, createRateLimiter } from "../../../lib/azure/token.ts";
import { parseTranslateRequest, parseTranslation, TRANSLATE_PROMPT, TRANSLATE_SCHEMA } from "../../../lib/read/translate.ts";

// Thai translation of the sentences in Read aloud: { th: ["...", "..."] }, one line per sentence.
// The text goes to the AI provider (Claude or Gemini, see src/lib/ai/aiServer.ts) for this one request and is not stored.
// GET tells the page whether the feature is on (it is off without an AI key).

const NO_STORE = { "Cache-Control": "no-store" };
const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

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
  const parsed = parseTranslateRequest(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const r = await aiJson({
    system: TRANSLATE_PROMPT,
    turns: [{ role: "user", content: JSON.stringify(parsed.sentences) }],
    schema: TRANSLATE_SCHEMA,
    effort: "low",
    maxTokens: 4000,
    // a wrong or garbled Thai line misleads a learner more than a slow answer costs: use the stronger models first
    tier: "quality",
  });
  if (!r.ok) return json({ error: r.reason }, r.reason === "rate_limited" ? 429 : r.reason === "refused" ? 422 : 502);
  const th = parseTranslation(r.text, parsed.sentences.length);
  if (!th) return json({ error: "empty" }, 502);
  return json({ th }, 200);
}

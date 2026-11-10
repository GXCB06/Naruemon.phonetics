import { askSystemPrompt, ANSWER_SCHEMA, parseAnswer, parseAskRequest } from "../../../lib/ai/askMyna.ts";
import { aiConfigured, aiJson, sameOrigin } from "../../../lib/ai/aiServer.ts";
import { clientIp, createRateLimiter } from "../../../lib/azure/token.ts";
import { findSentence } from "../../../lib/learn/content.ts";

// Ask Myna: a student's "why?" about one course sentence and their own drawing. Answers { en, th }.
// GET tells the page whether the feature is on (it is off without ANTHROPIC_API_KEY or GEMINI_API_KEY).

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
  const parsed = parseAskRequest(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { sentenceId, assigned, turns } = parsed.value;
  const sentence = findSentence(sentenceId);
  if (!sentence) return json({ error: "unknown sentence" }, 400);
  const system = askSystemPrompt(sentence, assigned);
  if (!system) return json({ error: "drawing does not fit the sentence" }, 400);

  const r = await aiJson({ system, turns, schema: ANSWER_SCHEMA, effort: "low", maxTokens: 4000, tier: "quality" });
  if (!r.ok) return json({ error: r.reason }, r.reason === "rate_limited" ? 429 : r.reason === "refused" ? 422 : 502);
  const answer = parseAnswer(r.text);
  if (!answer) return json({ error: "empty" }, 502);
  return json({ answer }, 200);
}

import { dictionary } from "cmu-pronouncing-dictionary";
import { clientIp, createRateLimiter } from "../../../lib/azure/token.ts";
import { sameOrigin } from "../../../lib/ai/aiServer.ts";
import { OVERRIDES } from "../../../lib/ipa/overrides.ts";
import { ipaForKeys } from "../../../lib/read/text.ts";

// IPA for the words of a text pasted into Read aloud: { words: { "morning": { ipa: "ˈmɔrnɪŋ" }, "mali": { ipa: null } } }.
// Uses the CMU dictionary on the server (it is large, so the browser never downloads it) and the class notation (r, not ɹ).
// Nothing is stored. A word the dictionary lacks (a name, a number) comes back with ipa null: we never guess.

const NO_STORE = { "Cache-Control": "no-store" };
const limiter = createRateLimiter({ limit: 40, windowMs: 60_000 });

function json(body: unknown, status: number, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...NO_STORE, ...extra } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
  const hit = limiter.hit(clientIp(request.headers), Date.now());
  if (!hit.ok) return json({ error: "rate_limited" }, 429, { "Retry-After": String(hit.retryAfterSec) });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const keys = (body as Record<string, unknown> | null)?.keys;
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 300 || !keys.every((k) => typeof k === "string" && /^[a-z0-9'-]{1,40}$/.test(k))) {
    return json({ error: "bad keys" }, 400);
  }
  return json({ words: ipaForKeys(keys as string[], dictionary, OVERRIDES) }, 200);
}

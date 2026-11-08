import {
  clientIp,
  createRateLimiter,
  createTokenCache,
  isValidRegion,
  tokenEndpoint,
} from "../../../lib/azure/token.ts";

// Hands the browser a short-lived Azure Speech token so the subscription key never leaves the server.
// Without AZURE_SPEECH_KEY / AZURE_SPEECH_REGION it answers 501 and the rest of the app keeps working.

const NO_STORE = { "Cache-Control": "no-store" };
const cache = createTokenCache();
const limiter = createRateLimiter({ limit: 12, windowMs: 60_000 });
/** Shared by concurrent requests so a burst makes one call to Azure. */
let inflight: Promise<string> | null = null;

function json(body: unknown, status: number, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...NO_STORE, ...extra } });
}

async function issueToken(key: string, region: string): Promise<string> {
  const res = await fetch(tokenEndpoint(region), {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": key, "Content-Length": "0" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  // Never include the key, the response body or the upstream status text in what we log or return.
  if (!res.ok) throw new Error(`token endpoint returned ${res.status}`);
  return await res.text();
}

export async function POST(request: Request) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !isValidRegion(region)) return json({ error: "azure_not_configured" }, 501);

  const now = Date.now();
  const hit = limiter.hit(clientIp(request.headers), now);
  if (!hit.ok) return json({ error: "rate_limited" }, 429, { "Retry-After": String(hit.retryAfterSec) });

  const cached = cache.get(now);
  if (cached) return json({ token: cached, region }, 200);

  try {
    inflight ??= issueToken(key, region).finally(() => {
      inflight = null;
    });
    const token = await inflight;
    cache.set(token, Date.now());
    return json({ token, region }, 200);
  } catch (e) {
    console.error("speech-token: could not get a token from Azure:", e instanceof Error ? e.message : "unknown error");
    return json({ error: "azure_token_failed" }, 502);
  }
}

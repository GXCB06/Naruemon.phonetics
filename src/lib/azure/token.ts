// Pure helpers for the /api/speech-token route (no Next imports, so they run in Vitest).

/** Azure issues tokens valid for 10 minutes; we reuse one for 9. */
export const TOKEN_TTL_MS = 9 * 60 * 1000;

/** Region names are lowercase letters/digits/hyphens (e.g. "southeastasia"). Anything else could redirect the key to another host. */
export function isValidRegion(region: string | undefined): region is string {
  return typeof region === "string" && /^[a-z0-9-]{2,40}$/.test(region);
}

export function tokenEndpoint(region: string): string {
  return `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
}

/** Best-effort client IP from proxy headers. Falls back to one shared bucket, which only makes the limit stricter. */
export function clientIp(headers: { get(name: string): string | null }): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0].trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export interface RateLimiter {
  /** Records a hit for `key` at time `now` (ms) and says whether it is allowed. */
  hit(key: string, now: number): { ok: true } | { ok: false; retryAfterSec: number };
}

/** Fixed-window per-key limiter held in memory. Old windows are pruned so the map cannot grow without bound. */
export function createRateLimiter(opts: { limit: number; windowMs: number; maxKeys?: number }): RateLimiter {
  const { limit, windowMs } = opts;
  const maxKeys = opts.maxKeys ?? 5000;
  const windows = new Map<string, { start: number; count: number }>();
  return {
    hit(key, now) {
      if (windows.size >= maxKeys) {
        for (const [k, w] of windows) if (now - w.start >= windowMs) windows.delete(k);
        if (windows.size >= maxKeys) windows.clear(); // under attack: reset rather than grow
      }
      let w = windows.get(key);
      if (!w || now - w.start >= windowMs) {
        w = { start: now, count: 0 };
        windows.set(key, w);
      }
      if (w.count >= limit) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((w.start + windowMs - now) / 1000)) };
      w.count += 1;
      return { ok: true };
    },
  };
}

export interface TokenCache {
  get(now: number): string | null;
  set(token: string, now: number): void;
}

export function createTokenCache(ttlMs: number = TOKEN_TTL_MS): TokenCache {
  let token: string | null = null;
  let expires = 0;
  return {
    get: (now) => (token !== null && now < expires ? token : null),
    set(t, now) {
      token = t;
      expires = now + ttlMs;
    },
  };
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "test-secret-key-0123456789";

function post(ip = "9.9.9.9") {
  return new Request("http://localhost/api/speech-token", { method: "POST", headers: { "x-forwarded-for": ip } });
}

// The route keeps its cache and rate limiter in module memory, so load a fresh copy per test.
async function loadRoute() {
  vi.resetModules();
  return await import("./route.ts");
}

describe("POST /api/speech-token", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("answers 501 azure_not_configured when the env vars are missing", async () => {
    vi.stubEnv("AZURE_SPEECH_KEY", "");
    vi.stubEnv("AZURE_SPEECH_REGION", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await loadRoute();
    const res = await POST(post());
    expect(res.status).toBe(501);
    expect(await res.json()).toEqual({ error: "azure_not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 501 for a malformed region instead of sending the key there", async () => {
    vi.stubEnv("AZURE_SPEECH_KEY", SECRET);
    vi.stubEnv("AZURE_SPEECH_REGION", "evil.example.com/");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await loadRoute();
    expect((await POST(post())).status).toBe(501);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns { token, region } without the key, and caches the token", async () => {
    vi.stubEnv("AZURE_SPEECH_KEY", SECRET);
    vi.stubEnv("AZURE_SPEECH_REGION", "southeastasia");
    const fetchMock = vi.fn(async () => new Response("jwt-token-abc", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await loadRoute();

    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ token: "jwt-token-abc", region: "southeastasia" });
    expect(text).not.toContain(SECRET);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://southeastasia.api.cognitive.microsoft.com/sts/v1.0/issueToken");
    expect((init.headers as Record<string, string>)["Ocp-Apim-Subscription-Key"]).toBe(SECRET);

    await POST(post());
    expect(fetchMock).toHaveBeenCalledTimes(1); // second call served from the cache
  });

  it("answers 502 and leaks nothing when Azure refuses", async () => {
    vi.stubEnv("AZURE_SPEECH_KEY", SECRET);
    vi.stubEnv("AZURE_SPEECH_REGION", "eastus");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`bad key ${SECRET}`, { status: 401 })));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await loadRoute();
    const res = await POST(post());
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).toBe(JSON.stringify({ error: "azure_token_failed" }));
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain(SECRET);
    errSpy.mockRestore();
  });

  it("rate-limits one IP with 429 and Retry-After", async () => {
    vi.stubEnv("AZURE_SPEECH_KEY", SECRET);
    vi.stubEnv("AZURE_SPEECH_REGION", "eastus");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("t", { status: 200 })));
    const { POST } = await loadRoute();
    let last = 200;
    let retry: string | null = null;
    for (let i = 0; i < 13; i++) {
      const res = await POST(post("7.7.7.7"));
      last = res.status;
      retry = res.headers.get("retry-after");
    }
    expect(last).toBe(429);
    expect(Number(retry)).toBeGreaterThan(0);
    expect((await POST(post("8.8.8.8"))).status).toBe(200); // another IP is fine
  });
});

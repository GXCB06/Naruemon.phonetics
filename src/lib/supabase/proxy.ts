import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env.ts";

/**
 * Session refresh for src/proxy.ts (Next 16 renamed middleware to proxy).
 * Refreshes an expiring auth token and writes the new cookies to both the request
 * (so Server Components see them) and the response (so the browser stores them).
 * It never redirects: pages decide for themselves whether they need a signed-in user.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const env = getSupabaseEnv();
  if (!env) return response; // no Supabase configured: do nothing

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        // Responses that set auth cookies must not be cached by a CDN.
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Do not run code between createServerClient and getClaims(): it validates the JWT
  // and triggers the refresh. A failure here must not take the whole site down.
  try {
    await supabase.auth.getClaims();
  } catch {
    // Network error talking to Supabase: serve the page without a refreshed session.
  }

  return response;
}

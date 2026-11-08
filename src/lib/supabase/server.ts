import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "./env.ts";

/**
 * Supabase client for Server Components and Route Handlers.
 * Create a NEW client per request (never share one across requests).
 * Returns null when the env vars are missing.
 *
 * With `cacheComponents`, reading cookies is runtime data: call this from code that
 * sits behind a <Suspense> boundary (pages) or from a Route Handler.
 */
export async function createClient() {
  const env = getSupabaseEnv();
  if (!env) return null;
  const cookieStore = await cookies();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only. Safe to ignore:
          // src/proxy.ts refreshes the session and writes the cookies on every request.
        }
      },
    },
  });
}

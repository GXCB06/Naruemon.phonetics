import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env.ts";

/**
 * Supabase client for Client Components (browser only).
 * Returns null when the env vars are missing so callers can show a friendly message.
 * Uses the public anon key; row-level security is what protects the data.
 */
export function createClient() {
  const env = getSupabaseEnv();
  if (!env) return null;
  return createBrowserClient(env.url, env.anonKey);
}

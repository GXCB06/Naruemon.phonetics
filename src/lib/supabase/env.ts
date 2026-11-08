// Supabase is optional: the app must keep working with no env vars set.
// Only the two public values are read here. The service-role key is never
// used by the app and must never get a NEXT_PUBLIC_ prefix.
//
// The two `process.env.NEXT_PUBLIC_*` reads must stay written out literally:
// Next inlines them into the browser bundle at build time by matching that text.

export type SupabaseEnv = { url: string; anonKey: string };

export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  try {
    new URL(url);
  } catch {
    return null; // malformed URL counts as "not configured" instead of crashing
  }
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseEnv() !== null;
}

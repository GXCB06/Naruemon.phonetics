import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/supabase/redirect";

// OAuth (Google) and magic-link sign-in both land here with `?code=...` (PKCE flow).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const toLogin = (error: string) => NextResponse.redirect(new URL(`/login?error=${error}`, origin));

  // The user pressed "Cancel" on Google's screen (or the provider reported an error).
  if (searchParams.get("error")) return toLogin("denied");

  const code = searchParams.get("code");
  if (!code) return toLogin("auth");

  const supabase = await createClient();
  if (!supabase) return toLogin("config");

  // Fails when the link was opened in a different browser/device than the one that asked for
  // it (the PKCE verifier cookie is missing) or when the link expired or was already used.
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return toLogin("auth");

  const next = safeNextPath(searchParams.get("next"));
  const response = NextResponse.redirect(new URL(next, origin));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

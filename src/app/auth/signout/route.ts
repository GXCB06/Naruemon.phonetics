import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Sign-out is a plain form POST (works without JavaScript). SameSite=Lax auth cookies
// are not sent on cross-site POSTs, so another site can't sign a learner out.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  // 303 turns the POST into a GET on /login.
  const response = NextResponse.redirect(new URL("/login", request.nextUrl.origin), 303);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

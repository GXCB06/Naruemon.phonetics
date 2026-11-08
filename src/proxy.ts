import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next 16 proxy (formerly middleware.ts): keeps the Supabase session fresh.
// Does nothing when the Supabase env vars are not set.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip static files, images, the AudioWorklet and sample audio.
    "/((?!_next/static|_next/image|favicon.ico|worklets/|samples/|audio/|.*\.(?:svg|png|jpg|jpeg|gif|webp|wav|mp3|js|css)$).*)",
  ],
};

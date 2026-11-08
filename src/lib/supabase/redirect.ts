/**
 * Only allow same-site relative paths as a post-login destination, so a crafted
 * `?next=https://evil.example` link can't turn the login flow into an open redirect.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/me"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}

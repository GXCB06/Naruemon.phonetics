"use client";

import { useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Msg = { en: string; th: string };
type Status =
  | { kind: "idle" }
  | { kind: "busy"; what: "google" | "email" }
  | { kind: "sent"; email: string }
  | { kind: "error"; msg: Msg };

const NETWORK_ERROR: Msg = {
  en: "We couldn't reach the sign-in service. Check your connection and try again.",
  th: "เชื่อมต่อระบบเข้าสู่ระบบไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่",
};

function describe(error: { status?: number; code?: string; name?: string; message: string }): Msg {
  if (error.status === 0 || error.name === "AuthRetryableFetchError") return NETWORK_ERROR;
  if (error.status === 429 || error.code === "over_email_send_rate_limit") {
    return {
      en: "Too many sign-in emails. Please wait a minute and try again.",
      th: "ส่งอีเมลบ่อยเกินไป รอสักครู่แล้วลองใหม่",
    };
  }
  if (error.code === "email_address_invalid" || error.code === "validation_failed") {
    return { en: "That email address doesn't look right.", th: "ที่อยู่อีเมลดูไม่ถูกต้อง" };
  }
  if (error.code === "provider_disabled" || error.code === "email_provider_disabled") {
    return {
      en: "This sign-in method isn't turned on yet. Try the other one.",
      th: "วิธีเข้าสู่ระบบนี้ยังไม่เปิดใช้งาน ลองใช้อีกวิธี",
    };
  }
  return { en: "Something went wrong. Please try again.", th: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" };
}

export function LoginForm({ next }: { next: string }) {
  const emailId = useId();
  const hintId = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const busy = status.kind === "busy";

  const callbackUrl = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function signInWithGoogle() {
    const supabase = createClient();
    if (!supabase) return setStatus({ kind: "error", msg: NETWORK_ERROR });
    setStatus({ kind: "busy", what: "google" });
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl() },
      });
      // On success the browser navigates to Google, so there is nothing more to do here.
      if (error) setStatus({ kind: "error", msg: describe(error) });
    } catch {
      setStatus({ kind: "error", msg: NETWORK_ERROR });
    }
  }

  async function sendMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();
    if (!address) return;
    const supabase = createClient();
    if (!supabase) return setStatus({ kind: "error", msg: NETWORK_ERROR });
    setStatus({ kind: "busy", what: "email" });
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: address,
        options: { emailRedirectTo: callbackUrl() },
      });
      setStatus(error ? { kind: "error", msg: describe(error) } : { kind: "sent", email: address });
    } catch {
      setStatus({ kind: "error", msg: NETWORK_ERROR });
    }
  }

  if (status.kind === "sent") {
    return (
      <section className="card flex flex-col gap-3 p-5" role="status">
        <h2 className="text-xl font-extrabold">Check your email</h2>
        <p className="thai text-lg font-bold text-muted">ตรวจสอบอีเมลของคุณ</p>
        <p>
          We sent a sign-in link to <strong className="break-all">{status.email}</strong>. Open it on this device.
        </p>
        <p className="thai text-muted">
          เราส่งลิงก์เข้าสู่ระบบไปที่ <span className="break-all">{status.email}</span> กรุณาเปิดลิงก์บนอุปกรณ์เครื่องนี้
        </p>
        <p className="text-sm text-muted">
          No email? Check your spam folder.
          <span className="thai ml-1">ไม่เห็นอีเมล? ลองดูในโฟลเดอร์สแปม</span>
        </p>
        <button type="button" className="btn" onClick={() => setStatus({ kind: "idle" })}>
          Use a different email · <span className="thai">ใช้อีเมลอื่น</span>
        </button>
      </section>
    );
  }

  return (
    <div className="card flex flex-col gap-5 p-5">
      <button type="button" className="btn w-full flex-col gap-0! text-center leading-tight" onClick={signInWithGoogle} disabled={busy}>
        <span className="inline-flex items-center gap-2">
          <GoogleMark />
          {status.kind === "busy" && status.what === "google" ? "Opening Google…" : "Continue with Google"}
        </span>
        <span className="thai text-sm font-semibold text-muted">ใช้บัญชี Google</span>
      </button>

      <div className="flex items-center gap-3 text-sm text-muted" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        <span>
          or · <span className="thai">หรือ</span>
        </span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={sendMagicLink} className="flex flex-col gap-3">
        <label htmlFor={emailId} className="flex flex-col text-sm font-bold">
          Email
          <span className="thai font-semibold text-muted">อีเมล</span>
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={hintId}
          aria-invalid={status.kind === "error" ? true : undefined}
          className="w-full rounded-2xl border-2 border-line bg-bg px-4 py-3 text-base text-ink placeholder:text-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
        <button type="submit" className="btn btn-primary w-full flex-col gap-0! text-center leading-tight" disabled={busy || !email.trim()}>
          <span>{status.kind === "busy" && status.what === "email" ? "Sending…" : "Email me a sign-in link"}</span>
          <span className="thai text-sm font-semibold">ส่งลิงก์เข้าสู่ระบบ</span>
        </button>
        <p id={hintId} className="text-sm text-muted">
          No password needed. We&apos;ll email you a one-time link.
          <span className="thai mt-1 block">ไม่ต้องใช้รหัสผ่าน เราจะส่งลิงก์ใช้ครั้งเดียวไปทางอีเมล</span>
        </p>
      </form>

      <div role="alert" className="empty:hidden">
        {status.kind === "error" && (
          <div className="rounded-2xl border-2 border-bad bg-bad-soft p-3 text-sm">
            <p className="font-semibold">{status.msg.en}</p>
            <p className="thai mt-1">{status.msg.th}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** The standard multicolour Google "G". */
function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

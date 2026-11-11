import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MynaBot } from "@/components/mascot/MynaBot";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { safeNextPath } from "@/lib/supabase/redirect";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in — Myna",
  description: "Sign in to Myna to save your intonation practice.",
};

// Bilingual messages for ?error=<code> (set by /auth/callback).
const ERRORS: Record<string, { en: string; th: string }> = {
  auth: {
    en: "That sign-in link didn't work. It may have expired, been used already, or been opened on a different device or browser. Please try again.",
    th: "ลิงก์เข้าสู่ระบบใช้ไม่ได้ อาจหมดอายุ ถูกใช้ไปแล้ว หรือเปิดคนละอุปกรณ์/เบราว์เซอร์ กรุณาลองใหม่อีกครั้ง",
  },
  denied: {
    en: "Sign-in was cancelled. You can try again whenever you like.",
    th: "ยกเลิกการเข้าสู่ระบบแล้ว ลองใหม่ได้ทุกเมื่อ",
  },
  config: {
    en: "Sign-in isn't set up on this server yet.",
    th: "เซิร์ฟเวอร์นี้ยังไม่ได้ตั้งค่าระบบเข้าสู่ระบบ",
  },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
      <Link href="/" className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <span aria-hidden>←</span> Myna
      </Link>

      <header className="flex flex-col gap-1">
        <div className="text-5xl" aria-hidden>
          🐦‍⬛
        </div>
        <h1 className="text-3xl font-black tracking-tight">Sign in</h1>
        <p className="thai text-xl font-bold text-muted">เข้าสู่ระบบ</p>
      </header>

      {/* searchParams is request-time data, so it is read behind a Suspense boundary. */}
      <Suspense fallback={<div className="card h-64 animate-pulse" aria-hidden />}>
        <LoginBody searchParams={searchParams} />
      </Suspense>

      <p className="text-sm text-muted">
        Your practice stays private. We never store your voice recordings.
        <span className="thai mt-1 block">การฝึกของคุณเป็นส่วนตัว เราไม่เก็บเสียงที่คุณบันทึก</span>
      </p>
    </main>
  );
}

async function LoginBody({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  if (!isSupabaseConfigured()) {
    return (
      <section className="card border-warn bg-warn-soft p-5" role="status" aria-labelledby="not-configured">
        <h2 id="not-configured" className="text-lg font-extrabold">
          Supabase isn&apos;t configured yet
        </h2>
        <p className="thai font-bold">ยังไม่ได้ตั้งค่า Supabase</p>
        <p className="mt-3 text-sm">
          Add <code className="rounded bg-card px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="rounded bg-card px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to <code>.env.local</code>, then restart the
          dev server. See <code>docs/supabase-setup.md</code>. Everything else in Myna still works without signing in.
        </p>
        <p className="thai mt-2 text-sm">
          เพิ่มค่า NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_ANON_KEY ในไฟล์ .env.local แล้วรีสตาร์ทเซิร์ฟเวอร์
          ส่วนอื่นของ Myna ยังใช้งานได้โดยไม่ต้องเข้าสู่ระบบ
        </p>
        <Link href="/lab" className="btn btn-primary mt-4">
          Open the lab · <span className="thai">เปิดห้องทดลอง</span>
        </Link>
      </section>
    );
  }

  const errorKey = first(params.error);
  const error = errorKey ? (ERRORS[errorKey] ?? ERRORS.auth) : null;
  const next = safeNextPath(first(params.next));
  const welcome = first(params.welcome) === "1";

  return (
    <>
      {welcome && (
        <div className="card flex items-start gap-3 p-4">
          <MynaBot mood="wink" className="size-14 shrink-0" />
          <p className="font-bold">
            Sign in to save your progress and use Myna on every device. You can also do it later.
            <span className="thai mt-1 block text-sm font-semibold text-muted">
              เข้าสู่ระบบเพื่อบันทึกความก้าวหน้าและใช้ Myna ได้ทุกเครื่อง จะทำทีหลังก็ได้
            </span>
          </p>
        </div>
      )}
      {error && (
        <div role="alert" className="card border-bad bg-bad-soft p-4 text-sm">
          <p className="font-semibold">{error.en}</p>
          <p className="thai mt-1">{error.th}</p>
        </div>
      )}
      <LoginForm next={next} />
      <Link href={first(params.next) ? next : "/"} className="btn w-full flex-col gap-0! text-center leading-tight">
        <span>Skip for now</span>
        <span className="thai text-sm font-semibold text-muted">ข้ามไปก่อน</span>
      </Link>
    </>
  );
}

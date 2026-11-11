import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Me — Melobi", robots: { index: false } };

export default function MePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
      <Link href="/" className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <span aria-hidden>←</span> Melobi
      </Link>
      <h1 className="text-3xl font-black tracking-tight">
        Me <span className="thai text-xl font-bold text-muted">· ฉัน</span>
      </h1>
      {/* The session cookie is request-time data, so it is read behind a Suspense boundary. */}
      <Suspense fallback={<div className="card h-40 animate-pulse" aria-hidden />}>
        <Account />
      </Suspense>
    </main>
  );
}

async function Account() {
  if (!isSupabaseConfigured()) {
    return (
      <section className="card border-warn bg-warn-soft p-5" role="status">
        <p className="font-extrabold">Supabase isn&apos;t configured yet</p>
        <p className="thai font-bold">ยังไม่ได้ตั้งค่า Supabase</p>
        <Link href="/login" className="btn btn-primary mt-4">
          Details · <span className="thai">รายละเอียด</span>
        </Link>
      </section>
    );
  }

  const supabase = await createClient();
  // getUser() asks the Supabase Auth server to validate the session (not just the cookie).
  const { data, error } = supabase ? await supabase.auth.getUser() : { data: { user: null }, error: null };
  if (error || !data.user) redirect("/login?next=/me");

  return (
    <section className="card flex flex-col gap-4 p-5">
      <div>
        <p className="text-sm font-bold text-muted">
          Signed in as <span className="thai">· เข้าสู่ระบบในชื่อ</span>
        </p>
        <p className="break-all text-xl font-extrabold">{data.user.email ?? "—"}</p>
      </div>
      <SignOutButton />
    </section>
  );
}

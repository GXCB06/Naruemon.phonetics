# Supabase setup (task C1)

Myna works without Supabase: `/` and `/lab` never need a login. Supabase adds sign-in (Google + email magic link) and,
later, saved attempts and progress. Without the two env vars, `/login` shows "Supabase isn't configured yet".

## 1. Create the project

1. Go to <https://supabase.com/dashboard> → **New project** (free tier is enough). Pick the region closest to your users
   (e.g. Singapore).
2. **Project Settings → API**: copy the **Project URL** and the **anon / publishable key**.
3. Put them in `.env.local` (copy `.env.example`; never commit `.env.local`):

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon or publishable key>
   ```

   The anon key is meant for the browser; row-level security protects the data. Do **not** put the `service_role` key in any
   `NEXT_PUBLIC_*` variable. The app does not use it.

## 2. Run the migration

Open **SQL Editor → New query**, paste the whole of [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql)
and run it once. It creates `profiles`, `attempts`, `skill_mastery`, `lesson_progress`, `xp_events`, `weekly_summaries`, turns
on row-level security on all of them (each user can only touch their own rows), and adds a trigger that creates a `profiles`
row when someone signs up.

(With the Supabase CLI instead: `supabase link --project-ref <ref>` then `supabase db push`.)

Check it: **Table Editor** shows six tables with the "RLS enabled" badge, and **Database → Triggers** lists
`on_auth_user_created` on `auth.users`.

## 3. Redirect URLs

**Authentication → URL Configuration**

- **Site URL**: your production URL, e.g. `https://myna.vercel.app` (use `http://localhost:3000` while only developing).
- **Redirect URLs** (allow list), add all of these:
  - `http://localhost:3000/**`
  - `http://localhost:3400/**` (the port used by `npm run dev -- --port 3400`)
  - `https://<your-production-domain>/**`
  - `https://*-<your-vercel-team>.vercel.app/**` (Vercel preview deployments)

The app sends users back to `/auth/callback`, which exchanges the code for a session and redirects to `/me`.

## 4. Google sign-in

1. <https://console.cloud.google.com> → create a project → **APIs & Services → OAuth consent screen** (External; add your
   email as a test user while the app is in testing) → **Credentials → Create credentials → OAuth client ID → Web application**.
2. **Authorized redirect URIs**: `https://<project-ref>.supabase.co/auth/v1/callback` (this is Supabase's URL, not the app's).
3. Copy the Client ID and Client secret.
4. Supabase: **Authentication → Providers → Google** → enable, paste both, save.

## 5. Email magic link

**Authentication → Providers → Email** is on by default. Notes:

- Supabase's built-in mailer is rate limited (a few emails per hour) and meant for testing. For ~50 classmates, set up a
  custom SMTP provider under **Authentication → Emails → SMTP Settings**.
- The link must be opened in the **same browser** that requested it (PKCE flow). Opening it on another device shows a friendly
  "that link didn't work" message on `/login`.
- Optional: edit the **Magic Link** email template (Authentication → Emails) with Thai/English text.

## 6. Vercel

In the Vercel project → **Settings → Environment Variables**, add `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` for Production **and** Preview, then redeploy (public variables are baked in at build time).

## 7. Try it

```bash
npm run dev -- --port 3400
```

Open <http://localhost:3400/login>, sign in, and you should land on `/me` showing your email. **Sign out** returns you to
`/login`. Visiting `/me` while signed out redirects to `/login`.

## How it fits together

| File | Role |
|---|---|
| `src/lib/supabase/env.ts` | Reads the two public env vars; `null` when missing/invalid, which is how the app stays usable without Supabase |
| `src/lib/supabase/client.ts` | Browser client (Client Components) |
| `src/lib/supabase/server.ts` | Server client for Server Components and Route Handlers (Next `cookies()`) |
| `src/proxy.ts` + `src/lib/supabase/proxy.ts` | Next 16 `proxy` (the renamed `middleware`): refreshes the session cookie on each request; no-op without env vars |
| `src/app/auth/callback/route.ts` | Exchanges the OAuth / magic-link `code` for a session |
| `src/app/auth/signout/route.ts` | Form-POST sign-out |
| `src/app/login`, `src/app/me` | Sign-in page and a server-side "who am I" check |

For authorization in server code use `supabase.auth.getUser()` (validated by the Auth server) or `getClaims()` (verifies the
JWT signature); never trust `getSession()` on the server.

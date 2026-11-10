-- Myna: Draw it grades and IPA practice results (SPEC D2/D4, section 7).
-- Run once in the Supabase SQL editor after 0001_init.sql and 0002_attempt_client_id.sql. Safe to run twice.
--
-- 1. attempts.draw_grade: Draw it's Perfect / Good / Miss verdict (null on speak and listen rows, and on draw rows saved
--    before this migration). Until this runs, the app saves draw attempts without the grade, so nothing is blocked.
-- 2. ipa_attempts: one row per checked word on the IPA practice page (/ipa). Only symbols are stored: never audio and
--    never the handwriting image. The app derives per-sound accuracy and mix-ups (θ → t, z → s) from answer + got.

-- ---------------------------------------------------------------- 1. draw grade

alter table public.attempts
  add column if not exists draw_grade text
  check (draw_grade in ('perfect', 'good', 'miss'));

-- ---------------------------------------------------------------- 2. IPA practice

create table if not exists public.ipa_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  client_id uuid,               -- random id made on the device: a retried upload never inserts the same word twice
  word text not null,
  mode text not null check (mode in ('build', 'write')),
  grade text not null check (grade in ('perfect', 'good', 'miss')),
  answer jsonb not null,        -- the answer, one symbol per tile, e.g. ["ˈ","s","t","u","d","ə","n","t"]
  got jsonb not null,           -- what the learner placed, same shape
  created_at timestamptz not null default now()
);
create unique index if not exists ipa_attempts_user_client_idx on public.ipa_attempts (user_id, client_id);
create index if not exists ipa_attempts_user_created_idx on public.ipa_attempts (user_id, created_at desc);

-- Row-level security: each learner reads and writes only their own rows. Append-only from the app (no update);
-- delete is allowed so learners can erase their data (PDPA), as for attempts.
alter table public.ipa_attempts enable row level security;

drop policy if exists "own ipa attempts: select" on public.ipa_attempts;
create policy "own ipa attempts: select" on public.ipa_attempts
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "own ipa attempts: insert" on public.ipa_attempts;
create policy "own ipa attempts: insert" on public.ipa_attempts
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "own ipa attempts: delete" on public.ipa_attempts;
create policy "own ipa attempts: delete" on public.ipa_attempts
  for delete to authenticated using ((select auth.uid()) = user_id);

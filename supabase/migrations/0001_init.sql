-- Myna: initial schema (SPEC.md section 7).
-- Every table is private to its owner via row-level security. Run once in the
-- Supabase SQL editor (or `supabase db push`). See docs/supabase-setup.md.

-- ---------------------------------------------------------------- tables

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  ui_lang text not null default 'th' check (ui_lang in ('th', 'en')),
  daily_goal_xp int not null default 30,
  streak_count int not null default 0,
  streak_last_day date,
  audio_opt_in boolean not null default false,  -- voice is personal data (PDPA): storage is opt-in only
  created_at timestamptz not null default now()
);

create table public.attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  sentence_id text not null,
  modality text not null check (modality in ('speak', 'draw', 'listen')),
  pattern text not null,
  levels jsonb,                 -- per-syllable [start,end] levels when timing is known
  checks jsonb not null,        -- [{ id, status }] per thought group
  shape_score int,
  overall int not null,
  azure_accuracy real,
  azure_prosody real,
  phoneme_errors jsonb,
  created_at timestamptz not null default now()
);
create index attempts_user_created_idx on public.attempts (user_id, created_at desc);

create table public.skill_mastery (
  user_id uuid not null references auth.users on delete cascade,
  pattern text not null,
  skill text not null,          -- start | singlePeak | peakPlacement | ending | range | break | listening | pronunciation
  modality text not null check (modality in ('speak', 'draw', 'listen')),
  score real not null default 0,
  attempts_n int not null default 0,
  last_seen timestamptz,
  next_review_at timestamptz,   -- ts-fsrs
  primary key (user_id, pattern, skill, modality)
);

create table public.lesson_progress (
  user_id uuid not null references auth.users on delete cascade,
  lesson_id text not null,
  stars int not null default 0,
  best_score int not null default 0,
  completed_at timestamptz,
  primary key (user_id, lesson_id)
);

create table public.xp_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  amount int not null,
  source text not null,
  created_at timestamptz not null default now()
);
create index xp_events_user_created_idx on public.xp_events (user_id, created_at desc);

create table public.weekly_summaries (
  user_id uuid not null references auth.users on delete cascade,
  week_start date not null,
  text_en text not null,
  text_th text not null,
  stats jsonb not null,
  primary key (user_id, week_start)
);

-- ---------------------------------------------------------------- row-level security
-- Enabled on every table. Policies are per-command and scoped to the
-- `authenticated` role, so anonymous (not signed-in) requests see nothing.
-- `(select auth.uid())` lets Postgres evaluate the uid once per query, not per row.

alter table public.profiles enable row level security;
alter table public.attempts enable row level security;
alter table public.skill_mastery enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.xp_events enable row level security;
alter table public.weekly_summaries enable row level security;

-- profiles: keyed by id (= auth.users.id). Rows are normally created by the signup
-- trigger below; the INSERT policy only lets a user create their OWN row (e.g. an account that
-- predates this migration). Delete cascades from auth.users.
create policy "own profile: select" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "own profile: insert" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "own profile: update" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- attempts: append-only history (no update/delete from clients) so a learner's progress log is stable.
create policy "own attempts: select" on public.attempts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own attempts: insert" on public.attempts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own attempts: delete" on public.attempts
  for delete to authenticated using ((select auth.uid()) = user_id);  -- lets learners erase their data (PDPA)

-- skill_mastery, lesson_progress: upserted by the app after each attempt.
create policy "own mastery: select" on public.skill_mastery
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own mastery: insert" on public.skill_mastery
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own mastery: update" on public.skill_mastery
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "own mastery: delete" on public.skill_mastery
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "own progress: select" on public.lesson_progress
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own progress: insert" on public.lesson_progress
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own progress: update" on public.lesson_progress
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "own progress: delete" on public.lesson_progress
  for delete to authenticated using ((select auth.uid()) = user_id);

-- xp_events: append-only ledger.
create policy "own xp: select" on public.xp_events
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own xp: insert" on public.xp_events
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own xp: delete" on public.xp_events
  for delete to authenticated using ((select auth.uid()) = user_id);

-- weekly_summaries: written server-side (cached AI summary), read by the owner.
create policy "own summaries: select" on public.weekly_summaries
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own summaries: insert" on public.weekly_summaries
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own summaries: update" on public.weekly_summaries
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "own summaries: delete" on public.weekly_summaries
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- signup trigger
-- Creates the profiles row when a user signs up (Google or magic link).
-- SECURITY DEFINER because the new user has no session yet when this fires;
-- search_path is pinned so the function cannot be hijacked by a same-named object.

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), '')
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Only the trigger should run it: not callable through the REST API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

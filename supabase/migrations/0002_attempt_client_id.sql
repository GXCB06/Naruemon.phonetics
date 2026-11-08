-- Myna: idempotent attempt writes (SPEC C5).
-- The app queues attempts on the device and flushes them to Supabase. Each attempt gets a random `client_id` there,
-- so a retried flush (flaky network, two tabs) can never insert the same attempt twice:
--   insert ... on conflict (user_id, client_id) do nothing
-- Rows created before this migration keep client_id = null; nulls never collide in a unique index.

alter table public.attempts add column if not exists client_id uuid;

create unique index if not exists attempts_user_client_idx on public.attempts (user_id, client_id);

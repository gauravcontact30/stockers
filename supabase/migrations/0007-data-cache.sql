-- The daily JSON caches, shared across serverless instances.
--
-- Everything under app/data used to live only on disk. That works on one long-lived machine and
-- cannot work on a serverless host: the application directory is read-only there, so each instance
-- keeps its refreshed copy in its own temporary directory and no other instance ever sees it. The
-- 8:50 AM lock is the case that made it visible — the scheduled invocation wrote the day's picks
-- into a container that then went away, and the instance rendering the landing page still read the
-- copy committed to the repository.
--
-- One row per cache file. `key` is the file name the code has always used.

create table if not exists public.data_cache (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists data_cache_updated_at_idx
  on public.data_cache (updated_at desc);

alter table public.data_cache enable row level security;
revoke all on public.data_cache from anon, authenticated;

-- Add the live-presence store, so the super admin dashboard can say how many people are on the
-- site right now rather than only how many arrived today.
--
-- This is the same statement that is now in schema.sql, extracted so a project that already has
-- the schema applied does not have to re-run the whole file. Safe to run more than once.
--
-- Nothing breaks without it: `touchPresence` swallows its failures the way every other write on
-- the analytics path does, so on a deployment that has not run this the heartbeats are silently
-- dropped and the Live Users page says the table is missing and names this file. Applying it is
-- what turns the page on.

begin;

create table if not exists public.live_sessions (
  -- The tab, namespaced by what identified it: `s:` per-tab, `v:` per-browser, `u:` the account.
  key text primary key,
  user_id text,
  visitor_id text,
  session_id text,
  -- Path only. The query string is stripped by the writer, before it ever reaches here.
  path text,
  device text,
  -- Defaulted rather than sent: an upsert only updates the columns it is given, so leaving this
  -- out of the payload is what stops a heartbeat resetting the start of a sitting every minute.
  started_at text not null default to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  last_seen_at text not null
);

create index if not exists live_sessions_last_seen_idx on public.live_sessions (last_seen_at desc);

-- This table says who is on the site right now and what page they are reading. Service role only.
alter table public.live_sessions enable row level security;
revoke all on public.live_sessions from anon, authenticated;

commit;

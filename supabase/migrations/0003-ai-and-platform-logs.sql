begin;

create table if not exists public.ai_calls (
  id text primary key,
  at text not null,
  day text not null,
  feature text not null,
  model text,
  outcome text not null check (outcome in ('ok', 'unusable', 'failed', 'unconfigured')),
  status integer,
  ms integer,
  prompt_tokens integer,
  completion_tokens integer,
  cost_usd double precision,
  streamed boolean not null default false,
  error text
);

create index if not exists ai_calls_day_idx on public.ai_calls (day, at desc);

alter table public.ai_calls enable row level security;
revoke all on public.ai_calls from anon, authenticated;

create table if not exists public.platform_logs (
  id text primary key,
  at text not null,
  day text not null,
  category text not null check (category in ('dashboard', 'api', 'ai', 'third-party', 'data', 'billing', 'security', 'system')),
  severity text not null check (severity in ('star', 'info', 'warning', 'error', 'critical')),
  source text not null,
  use_case text not null,
  operation text not null,
  message text not null,
  status_code integer,
  duration_ms integer,
  user_id text,
  path text,
  method text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists platform_logs_day_idx on public.platform_logs (day desc, at desc);
create index if not exists platform_logs_category_idx on public.platform_logs (category, day desc, at desc);
create index if not exists platform_logs_severity_idx on public.platform_logs (severity, day desc, at desc);
create index if not exists platform_logs_user_idx
  on public.platform_logs (user_id, day desc)
  where user_id is not null;

alter table public.platform_logs enable row level security;
revoke all on public.platform_logs from anon, authenticated;

commit;

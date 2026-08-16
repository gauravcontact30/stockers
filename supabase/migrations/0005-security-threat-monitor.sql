create table if not exists public.blocked_ips (
  id text primary key,
  ip text not null unique,
  reason text not null,
  blocked_at timestamptz not null,
  blocked_by text not null
);

create index if not exists blocked_ips_blocked_at_idx
  on public.blocked_ips (blocked_at desc);

alter table public.blocked_ips enable row level security;
revoke all on public.blocked_ips from anon, authenticated;

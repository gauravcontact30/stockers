begin;

comment on table public.platform_logs is
  'Durable sanitized application performance logs for the StockersAI super-admin dashboard in the stockersai_db Supabase database.';

create index if not exists platform_logs_source_idx on public.platform_logs (source, day desc, at desc);

create index if not exists platform_logs_status_idx
  on public.platform_logs (status_code, day desc, at desc)
  where status_code is not null;

create index if not exists platform_logs_duration_idx
  on public.platform_logs (duration_ms desc, day desc)
  where duration_ms is not null;

commit;

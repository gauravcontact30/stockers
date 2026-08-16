alter table public.users
  add column if not exists password_reset_token text,
  add column if not exists password_reset_expires_at text,
  add column if not exists password_reset_sent_at text,
  add column if not exists mfa_mode text not null default 'off',
  add column if not exists mfa_enforced boolean not null default false,
  add column if not exists mfa_totp_secret text,
  add column if not exists mfa_otp_hash text,
  add column if not exists mfa_otp_expires_at text,
  add column if not exists social_providers text[] not null default '{}',
  add column if not exists social_provider_ids jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_mfa_mode_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_mfa_mode_check check (mfa_mode in ('off', 'sms', 'totp'));
  end if;
end $$;

create index if not exists users_password_reset_token_idx
  on public.users (password_reset_token)
  where password_reset_token is not null;

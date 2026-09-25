-- First-party admin OTP challenges and opaque sessions.
-- Raw OTP codes and session tokens are never persisted.
create table if not exists public.admin_otp_challenges (
  id uuid primary key,
  admin_id uuid references public.admins(id) on delete cascade,
  recipient_hash text not null,
  request_fingerprint text not null,
  code_hash text not null,
  attempts integer not null default 0,
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (attempts between 0 and max_attempts)
);

create index if not exists admin_otp_recipient_created_idx
  on public.admin_otp_challenges(recipient_hash, created_at desc);
create index if not exists admin_otp_fingerprint_created_idx
  on public.admin_otp_challenges(request_fingerprint, created_at desc);

create table if not exists public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.admins(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists admin_sessions_admin_idx
  on public.admin_sessions(admin_id, expires_at desc);
create index if not exists admin_sessions_active_idx
  on public.admin_sessions(token_hash)
  where revoked_at is null;

alter table public.admin_otp_challenges enable row level security;
alter table public.admin_sessions enable row level security;
revoke all on table public.admin_otp_challenges, public.admin_sessions from anon, authenticated;

-- These tables are intentionally service-role only. Application code validates
-- the signed cookie and then performs an authoritative server-side lookup.

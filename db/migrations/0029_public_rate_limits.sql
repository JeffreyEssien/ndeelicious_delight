-- Durable, privacy-preserving rate limits shared by every application instance.

create table if not exists public.public_rate_limits (
  scope text not null check (scope ~ '^[a-z0-9_-]{2,60}$'),
  key_hash text not null check (key_hash ~ '^[a-f0-9]{64}$'),
  request_count integer not null default 1 check (request_count > 0),
  window_started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (scope, key_hash),
  check (expires_at > window_started_at)
);

create index if not exists public_rate_limits_expires_idx
  on public.public_rate_limits(expires_at);

alter table public.public_rate_limits enable row level security;
revoke all on table public.public_rate_limits from public, anon, authenticated;

create or replace function public.consume_public_rate_limit(
  p_scope text,
  p_key_hash text,
  p_window_seconds integer,
  p_max_requests integer
)
returns table(allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer;
  v_expires_at timestamptz;
begin
  if p_scope !~ '^[a-z0-9_-]{2,60}$'
    or p_key_hash !~ '^[a-f0-9]{64}$'
    or p_window_seconds < 10 or p_window_seconds > 86400
    or p_max_requests < 1 or p_max_requests > 10000
  then
    raise exception using errcode = '22023', message = 'INVALID_RATE_LIMIT_RULE';
  end if;

  insert into public.public_rate_limits (
    scope, key_hash, request_count, window_started_at, expires_at, updated_at
  ) values (
    p_scope, p_key_hash, 1, v_now, v_now + make_interval(secs => p_window_seconds), v_now
  )
  on conflict (scope, key_hash) do update set
    request_count = case
      when public.public_rate_limits.expires_at <= v_now then 1
      else public.public_rate_limits.request_count + 1
    end,
    window_started_at = case
      when public.public_rate_limits.expires_at <= v_now then v_now
      else public.public_rate_limits.window_started_at
    end,
    expires_at = case
      when public.public_rate_limits.expires_at <= v_now then v_now + make_interval(secs => p_window_seconds)
      else public.public_rate_limits.expires_at
    end,
    updated_at = v_now
  returning request_count, expires_at into v_count, v_expires_at;

  return query select
    v_count <= p_max_requests,
    greatest(1, ceil(extract(epoch from (v_expires_at - v_now)))::integer);
end;
$$;

revoke all on function public.consume_public_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_public_rate_limit(text, text, integer, integer)
  to service_role;

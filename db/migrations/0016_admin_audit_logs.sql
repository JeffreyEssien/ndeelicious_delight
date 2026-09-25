-- Immutable, service-role-only audit history for sensitive admin changes.

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.admins(id),
  admin_session_id uuid references public.admin_sessions(id) on delete set null,
  action text not null check (char_length(action) between 3 and 100),
  entity_type text not null check (char_length(entity_type) between 2 and 100),
  entity_id text check (entity_id is null or char_length(entity_id) between 1 and 200),
  previous_value jsonb,
  new_value jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_idx
  on public.admin_audit_logs(created_at desc);
create index if not exists admin_audit_logs_admin_created_idx
  on public.admin_audit_logs(admin_id, created_at desc);
create index if not exists admin_audit_logs_entity_idx
  on public.admin_audit_logs(entity_type, entity_id, created_at desc);

alter table public.admin_audit_logs enable row level security;
revoke all on table public.admin_audit_logs from anon, authenticated;

create or replace function public.prevent_admin_audit_log_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'ADMIN_AUDIT_LOGS_ARE_IMMUTABLE';
end;
$$;

drop trigger if exists admin_audit_logs_immutable on public.admin_audit_logs;
create trigger admin_audit_logs_immutable
before update or delete on public.admin_audit_logs
for each row execute function public.prevent_admin_audit_log_changes();

create or replace function public.record_admin_audit(
  p_admin_id uuid,
  p_admin_session_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text default null,
  p_previous_value jsonb default null,
  p_new_value jsonb default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1
    from public.admin_sessions sessions
    join public.admins admins on admins.id = sessions.admin_id
    where sessions.id = p_admin_session_id
      and sessions.admin_id = p_admin_id
      and sessions.revoked_at is null
      and sessions.expires_at > now()
      and admins.active = true
  ) then
    raise exception using errcode = '42501', message = 'INVALID_ADMIN_AUDIT_ACTOR';
  end if;

  insert into public.admin_audit_logs (
    admin_id,
    admin_session_id,
    action,
    entity_type,
    entity_id,
    previous_value,
    new_value,
    metadata
  ) values (
    p_admin_id,
    p_admin_session_id,
    trim(p_action),
    trim(p_entity_type),
    nullif(trim(p_entity_id), ''),
    p_previous_value,
    p_new_value,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_admin_audit(uuid, uuid, text, text, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_admin_audit(uuid, uuid, text, text, text, jsonb, jsonb, jsonb)
  to service_role;

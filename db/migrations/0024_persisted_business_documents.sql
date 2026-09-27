-- Persisted, immutable financial documents and revocable customer access.

create table if not exists public.business_documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('QUOTE', 'INVOICE', 'RECEIPT')),
  number text not null unique check (char_length(number) between 4 and 80),
  order_id uuid references public.orders(id),
  cake_order_id uuid references public.custom_cake_orders(id),
  revision integer not null default 1 check (revision > 0),
  state text not null default 'ISSUED' check (state in (
    'DRAFT', 'ISSUED', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED',
    'SUPERSEDED', 'PAID', 'VOID'
  )),
  issued_at timestamptz not null default now(),
  valid_until timestamptz,
  due_at timestamptz,
  business_snapshot jsonb not null,
  customer_snapshot jsonb not null,
  line_items_snapshot jsonb not null,
  totals_snapshot jsonb not null,
  branding_snapshot jsonb not null,
  presentation_snapshot jsonb not null default '{}'::jsonb,
  supersedes_document_id uuid references public.business_documents(id),
  created_by uuid references public.admins(id) on delete set null,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(business_snapshot) = 'object'),
  check (jsonb_typeof(customer_snapshot) = 'object'),
  check (jsonb_typeof(line_items_snapshot) = 'array'),
  check (jsonb_typeof(totals_snapshot) = 'object'),
  check (jsonb_typeof(branding_snapshot) = 'object'),
  check (jsonb_typeof(presentation_snapshot) = 'object'),
  check ((kind = 'QUOTE' and cake_order_id is not null) or kind <> 'QUOTE'),
  check ((kind in ('INVOICE', 'RECEIPT') and order_id is not null) or kind = 'QUOTE'),
  check (valid_until is null or valid_until > issued_at),
  check (due_at is null or due_at >= issued_at)
);

create unique index if not exists business_documents_order_revision_idx
  on public.business_documents(kind, order_id, revision)
  where order_id is not null;
create unique index if not exists business_documents_cake_revision_idx
  on public.business_documents(kind, cake_order_id, revision)
  where cake_order_id is not null;
create index if not exists business_documents_order_idx
  on public.business_documents(order_id, kind, revision desc);
create index if not exists business_documents_cake_idx
  on public.business_documents(cake_order_id, kind, revision desc);

create table if not exists public.document_access_tokens (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.business_documents(id) on delete cascade,
  token_hash text not null unique check (char_length(token_hash) = 64),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists document_access_tokens_document_idx
  on public.document_access_tokens(document_id, created_at desc);
create index if not exists document_access_tokens_active_idx
  on public.document_access_tokens(token_hash, expires_at)
  where revoked_at is null;

create table if not exists public.document_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.business_documents(id),
  action text not null check (action in (
    'QUOTE_ISSUED','QUOTE_REVISED','QUOTE_ACCEPTED','QUOTE_DECLINED',
    'INVOICE_ISSUED','INVOICE_SENT','RECEIPT_ISSUED','RECEIPT_SENT',
    'DOCUMENT_TOKEN_REVOKED'
  )),
  actor_admin_id uuid references public.admins(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists document_events_document_created_idx
  on public.document_events(document_id, created_at desc);

alter table public.business_documents enable row level security;
alter table public.document_access_tokens enable row level security;
alter table public.document_events enable row level security;
revoke all on table public.business_documents, public.document_access_tokens, public.document_events from anon, authenticated;

create or replace function public.prevent_document_event_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'DOCUMENT_EVENTS_ARE_IMMUTABLE';
end;
$$;
drop trigger if exists document_events_immutable on public.document_events;
create trigger document_events_immutable before update or delete on public.document_events
for each row execute function public.prevent_document_event_changes();

create or replace function public.guard_business_document_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'BUSINESS_DOCUMENTS_ARE_IMMUTABLE';
  end if;
  if coalesce(current_setting('app.document_lifecycle', true), '') <> 'allowed'
    or old.id <> new.id
    or old.kind <> new.kind
    or old.number <> new.number
    or old.order_id is distinct from new.order_id
    or old.cake_order_id is distinct from new.cake_order_id
    or old.revision <> new.revision
    or old.issued_at <> new.issued_at
    or old.valid_until is distinct from new.valid_until
    or old.due_at is distinct from new.due_at
    or old.business_snapshot <> new.business_snapshot
    or old.customer_snapshot <> new.customer_snapshot
    or old.line_items_snapshot <> new.line_items_snapshot
    or old.totals_snapshot <> new.totals_snapshot
    or old.branding_snapshot <> new.branding_snapshot
    or old.presentation_snapshot <> new.presentation_snapshot
    or old.supersedes_document_id is distinct from new.supersedes_document_id
    or old.created_by is distinct from new.created_by
    or old.created_at <> new.created_at
  then
    raise exception using errcode = 'P0001', message = 'BUSINESS_DOCUMENTS_ARE_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists business_documents_immutable on public.business_documents;
create trigger business_documents_immutable
before update or delete on public.business_documents
for each row execute function public.guard_business_document_changes();

create or replace function public.guard_document_token_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_ACCESS_TOKENS_ARE_APPEND_ONLY';
  end if;
  if coalesce(current_setting('app.document_token_revoke', true), '') <> 'allowed'
    or old.id <> new.id
    or old.document_id <> new.document_id
    or old.token_hash <> new.token_hash
    or old.expires_at <> new.expires_at
    or old.created_at <> new.created_at
    or old.revoked_at is not null
    or new.revoked_at is null
  then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_ACCESS_TOKENS_ARE_APPEND_ONLY';
  end if;
  return new;
end;
$$;

drop trigger if exists document_access_tokens_append_only on public.document_access_tokens;
create trigger document_access_tokens_append_only
before update or delete on public.document_access_tokens
for each row execute function public.guard_document_token_changes();

create or replace function public.transition_business_document(
  p_document_id uuid,
  p_from_states text[],
  p_to_state text
)
returns public.business_documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.business_documents;
begin
  if p_to_state not in ('ISSUED','SENT','ACCEPTED','DECLINED','EXPIRED','SUPERSEDED','PAID','VOID') then
    raise exception using errcode = '22023', message = 'INVALID_DOCUMENT_STATE';
  end if;
  perform set_config('app.document_lifecycle', 'allowed', true);
  update public.business_documents
  set state = p_to_state
  where id = p_document_id and state = any(p_from_states)
  returning * into v_document;
  if v_document.id is null then
    select * into v_document from public.business_documents where id = p_document_id;
    if v_document.id is null then raise exception using errcode = 'P0002', message = 'DOCUMENT_NOT_FOUND'; end if;
    if v_document.state <> p_to_state then
      raise exception using errcode = 'P0001', message = 'INVALID_DOCUMENT_TRANSITION';
    end if;
  end if;
  return v_document;
end;
$$;

create or replace function public.revoke_document_tokens(p_document_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  perform set_config('app.document_token_revoke', 'allowed', true);
  update public.document_access_tokens
  set revoked_at = now()
  where document_id = p_document_id and revoked_at is null;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    insert into public.document_events(document_id, action, metadata)
    values (p_document_id, 'DOCUMENT_TOKEN_REVOKED', jsonb_build_object('count', v_count));
  end if;
  return v_count;
end;
$$;

create or replace function public.respond_to_quote(
  p_token_hash text,
  p_response text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_document public.business_documents;
begin
  if p_response not in ('ACCEPTED', 'DECLINED') then
    raise exception using errcode = '22023', message = 'INVALID_QUOTE_RESPONSE';
  end if;
  select documents.* into v_document
  from public.document_access_tokens tokens
  join public.business_documents documents on documents.id = tokens.document_id
  where tokens.token_hash = p_token_hash
    and tokens.revoked_at is null
    and tokens.expires_at > now()
    and documents.kind = 'QUOTE'
  for update of documents;
  if v_document.id is null then raise exception using errcode = 'P0002', message = 'QUOTE_NOT_AVAILABLE'; end if;
  if v_document.state = p_response then
    return jsonb_build_object('documentId', v_document.id, 'state', v_document.state);
  end if;
  if v_document.state not in ('ISSUED', 'SENT') then
    raise exception using errcode = 'P0001', message = 'QUOTE_ALREADY_RESPONDED';
  end if;
  perform set_config('app.document_lifecycle', 'allowed', true);
  update public.business_documents set state = p_response where id = v_document.id;
  update public.custom_cake_orders
  set status = case when p_response = 'ACCEPTED' then 'CUSTOMER_APPROVED'::public.cake_status else 'CANCELLED'::public.cake_status end,
      updated_at = now()
  where id = v_document.cake_order_id;
  insert into public.document_events(document_id, action)
  values (v_document.id, case when p_response = 'ACCEPTED' then 'QUOTE_ACCEPTED' else 'QUOTE_DECLINED' end);
  return jsonb_build_object('documentId', v_document.id, 'state', p_response);
end;
$$;

revoke all on function public.transition_business_document(uuid, text[], text) from public, anon, authenticated;
revoke all on function public.revoke_document_tokens(uuid) from public, anon, authenticated;
revoke all on function public.respond_to_quote(text, text) from public, anon, authenticated;
grant execute on function public.transition_business_document(uuid, text[], text) to service_role;
grant execute on function public.revoke_document_tokens(uuid) to service_role;
grant execute on function public.respond_to_quote(text, text) to service_role;

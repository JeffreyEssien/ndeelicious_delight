-- Enforced order lifecycle, immutable activity, durable notifications, and refunds.

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null check (event_type in (
    'STATUS_CHANGED', 'INTERNAL_NOTE', 'REFUND_REQUESTED',
    'REFUND_SUCCEEDED', 'REFUND_FAILED', 'EMAIL_SENT', 'EMAIL_FAILED'
  )),
  from_status public.order_status,
  to_status public.order_status,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  actor_admin_id uuid references public.admins(id),
  created_at timestamptz not null default now()
);

create index if not exists order_events_order_created_idx
  on public.order_events(order_id, created_at desc);

create table if not exists public.order_notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null check (event_type in (
    'ORDER_RECEIVED', 'PAID', 'CONFIRMED', 'PREPARING',
    'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'REFUNDED'
  )),
  recipient text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'SENDING', 'SENT', 'FAILED')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id, event_type, recipient)
);

create index if not exists order_notifications_pending_idx
  on public.order_notifications(status, next_attempt_at)
  where status in ('PENDING', 'FAILED');

alter table public.payments add column if not exists refunded_amount integer not null default 0;

create table if not exists public.order_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  payment_id uuid not null references public.payments(id),
  provider_refund_id text unique,
  amount integer not null check (amount > 0),
  reason text not null check (char_length(reason) between 3 and 500),
  status text not null default 'PENDING' check (status in ('PENDING', 'SUCCEEDED', 'FAILED')),
  idempotency_key uuid not null unique,
  actor_admin_id uuid not null references public.admins(id),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_refunds_order_created_idx
  on public.order_refunds(order_id, created_at desc);

alter table public.order_events enable row level security;
alter table public.order_notifications enable row level security;
alter table public.order_refunds enable row level security;
revoke all on table public.order_events, public.order_notifications, public.order_refunds from anon, authenticated;

create or replace function public.prevent_order_event_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'ORDER_EVENTS_ARE_IMMUTABLE';
end;
$$;

drop trigger if exists order_events_immutable on public.order_events;
create trigger order_events_immutable
before update or delete on public.order_events
for each row execute function public.prevent_order_event_changes();

create or replace function public.enforce_order_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_allowed boolean := false;
  v_actor uuid;
  v_source text := coalesce(nullif(current_setting('app.order_source', true), ''), 'SYSTEM');
begin
  if old.status = new.status then return new; end if;
  v_allowed := case old.status
    when 'PENDING_PAYMENT' then new.status in ('PAID', 'FAILED', 'CANCELLED')
    when 'FAILED' then new.status in ('PENDING_PAYMENT', 'CANCELLED')
    when 'PAID' then new.status in ('CONFIRMED', 'REFUNDED')
    when 'CONFIRMED' then new.status in ('PREPARING', 'REFUNDED')
    when 'PREPARING' then new.status in ('READY', 'REFUNDED')
    when 'READY' then new.status in ('OUT_FOR_DELIVERY', 'DELIVERED', 'REFUNDED')
    when 'OUT_FOR_DELIVERY' then new.status in ('DELIVERED', 'REFUNDED')
    when 'DELIVERED' then new.status = 'REFUNDED'
    else false
  end;
  if not v_allowed then
    raise exception using errcode = 'P0001', message = 'INVALID_ORDER_TRANSITION';
  end if;
  begin
    v_actor := nullif(current_setting('app.admin_id', true), '')::uuid;
  exception when invalid_text_representation then
    v_actor := null;
  end;
  insert into public.order_events(order_id, event_type, from_status, to_status, actor_admin_id, metadata)
  values (new.id, 'STATUS_CHANGED', old.status, new.status, v_actor, jsonb_build_object('source', v_source));
  if new.status in ('PAID', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'REFUNDED') then
    insert into public.order_notifications(order_id, event_type, recipient)
    values (new.id, new.status::text, new.email)
    on conflict (order_id, event_type, recipient) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_order_status_transition on public.orders;
create trigger enforce_order_status_transition
before update of status on public.orders
for each row execute function public.enforce_order_status_transition();

create or replace function public.admin_transition_order_status(
  p_order_number text,
  p_status text,
  p_admin_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED') then
    raise exception using errcode = '22023', message = 'ADMIN_STATUS_NOT_ALLOWED';
  end if;
  perform set_config('app.admin_id', p_admin_id::text, true);
  perform set_config('app.order_source', 'ADMIN', true);
  perform public.transition_order_status(p_order_number, p_status);
end;
$$;

create or replace function public.add_order_internal_note(
  p_order_number text,
  p_note text,
  p_admin_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
begin
  if char_length(trim(coalesce(p_note, ''))) > 2000 then
    raise exception using errcode = '22023', message = 'INVALID_INTERNAL_NOTE';
  end if;
  update public.orders
  set internal_note = nullif(trim(p_note), ''), updated_at = now()
  where order_number = p_order_number
  returning id into v_order_id;
  if v_order_id is null then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;
  insert into public.order_events(order_id, event_type, note, actor_admin_id)
  values (v_order_id, 'INTERNAL_NOTE', nullif(trim(p_note), ''), p_admin_id);
end;
$$;

create or replace function public.begin_order_refund(
  p_order_number text,
  p_amount integer,
  p_reason text,
  p_idempotency_key uuid,
  p_admin_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_payment record;
  v_refund record;
begin
  select * into v_refund from public.order_refunds where idempotency_key = p_idempotency_key;
  if found then
    select provider_payload into v_payment from public.payments where id = v_refund.payment_id;
    return jsonb_build_object(
      'refundId', v_refund.id,
      'status', v_refund.status,
      'amount', v_refund.amount,
      'paymentIntentId', v_payment.provider_payload ->> 'payment_intent_id'
    );
  end if;
  select * into v_order from public.orders where order_number = p_order_number for update;
  if not found then raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND'; end if;
  if v_order.status not in ('PAID', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED') then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_REFUNDABLE';
  end if;
  select * into v_payment
  from public.payments
  where order_id = v_order.id and status in ('SUCCEEDED', 'PARTIALLY_REFUNDED')
  order by paid_at desc nulls last, created_at desc
  limit 1 for update;
  if not found then raise exception using errcode = 'P0002', message = 'PAYMENT_NOT_REFUNDABLE'; end if;
  if p_amount < 1 or p_amount > v_payment.amount - v_payment.refunded_amount then
    raise exception using errcode = '22023', message = 'INVALID_REFUND_AMOUNT';
  end if;
  if coalesce(v_payment.provider_payload ->> 'payment_intent_id', '') = '' then
    raise exception using errcode = 'P0002', message = 'PAYMENT_INTENT_MISSING';
  end if;
  insert into public.order_refunds(order_id, payment_id, amount, reason, idempotency_key, actor_admin_id)
  values (v_order.id, v_payment.id, p_amount, trim(p_reason), p_idempotency_key, p_admin_id)
  returning * into v_refund;
  insert into public.order_events(order_id, event_type, note, actor_admin_id, metadata)
  values (v_order.id, 'REFUND_REQUESTED', trim(p_reason), p_admin_id, jsonb_build_object('amount', p_amount));
  return jsonb_build_object(
    'refundId', v_refund.id,
    'status', v_refund.status,
    'amount', v_refund.amount,
    'paymentIntentId', v_payment.provider_payload ->> 'payment_intent_id'
  );
end;
$$;

create or replace function public.complete_order_refund(
  p_refund_id uuid,
  p_provider_refund_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund record;
  v_payment record;
  v_order record;
  v_total integer;
begin
  select * into v_refund from public.order_refunds where id = p_refund_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'REFUND_NOT_FOUND'; end if;
  if v_refund.status = 'SUCCEEDED' then
    select status into v_order from public.orders where id = v_refund.order_id;
    return jsonb_build_object('status', v_order.status, 'alreadyProcessed', true);
  end if;
  select * into v_payment from public.payments where id = v_refund.payment_id for update;
  v_total := v_payment.refunded_amount + v_refund.amount;
  if v_total > v_payment.amount then raise exception using errcode = 'P0001', message = 'REFUND_TOTAL_EXCEEDED'; end if;
  update public.order_refunds
  set status = 'SUCCEEDED', provider_refund_id = p_provider_refund_id, error_code = null, updated_at = now()
  where id = v_refund.id;
  update public.payments
  set refunded_amount = v_total,
      status = case when v_total = amount then 'REFUNDED'::public.payment_status else 'PARTIALLY_REFUNDED'::public.payment_status end,
      updated_at = now()
  where id = v_payment.id;
  select * into v_order from public.orders where id = v_refund.order_id for update;
  insert into public.order_events(order_id, event_type, note, actor_admin_id, metadata)
  values (v_order.id, 'REFUND_SUCCEEDED', v_refund.reason, v_refund.actor_admin_id, jsonb_build_object('amount', v_refund.amount, 'providerRefundId', p_provider_refund_id));
  if v_total = v_payment.amount then
    perform set_config('app.admin_id', v_refund.actor_admin_id::text, true);
    perform set_config('app.order_source', 'REFUND', true);
    perform public.transition_order_status(v_order.order_number, 'REFUNDED');
  end if;
  return jsonb_build_object('status', case when v_total = v_payment.amount then 'REFUNDED' else v_order.status::text end, 'alreadyProcessed', false);
end;
$$;

create or replace function public.fail_order_refund(p_refund_id uuid, p_error_code text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.order_refunds
  set status = 'FAILED', error_code = left(coalesce(p_error_code, 'unknown'), 100), updated_at = now()
  where id = p_refund_id and status <> 'SUCCEEDED';
  insert into public.order_events(order_id, event_type, actor_admin_id, metadata)
  select order_id, 'REFUND_FAILED', actor_admin_id, jsonb_build_object('amount', amount, 'errorCode', left(coalesce(p_error_code, 'unknown'), 100))
  from public.order_refunds where id = p_refund_id;
$$;

revoke all on function public.admin_transition_order_status(text, text, uuid) from public, anon, authenticated;
revoke all on function public.add_order_internal_note(text, text, uuid) from public, anon, authenticated;
revoke all on function public.begin_order_refund(text, integer, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_order_refund(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_order_refund(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_transition_order_status(text, text, uuid) to service_role;
grant execute on function public.add_order_internal_note(text, text, uuid) to service_role;
grant execute on function public.begin_order_refund(text, integer, text, uuid, uuid) to service_role;
grant execute on function public.complete_order_refund(uuid, text) to service_role;
grant execute on function public.fail_order_refund(uuid, text) to service_role;
grant select, insert, update on table public.order_notifications, public.order_refunds to service_role;
grant select, insert on table public.order_events to service_role;

insert into public.order_notifications(order_id, event_type, recipient)
select id, 'PAID', email from public.orders where status = 'PAID'
on conflict (order_id, event_type, recipient) do nothing;

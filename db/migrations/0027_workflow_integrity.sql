-- Close cross-system integrity gaps for custom-cake payments, linked cake status,
-- persisted document presentation, and durable quote delivery.

create or replace function public.reserve_order_inventory(
  p_order_id uuid,
  p_hold_minutes integer default 15
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_status public.order_status;
  v_expires_at timestamptz;
  v_existing_expiry timestamptz;
  v_stock integer;
  v_reserved integer;
  v_tracked boolean;
  v_status public.product_status;
  v_active boolean;
  item record;
begin
  if p_hold_minutes < 1 or p_hold_minutes > 60 then
    raise exception using errcode = '22023', message = 'INVALID_HOLD_DURATION';
  end if;

  select status into v_order_status
  from public.orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND'; end if;
  if v_order_status <> 'PENDING_PAYMENT' then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_RESERVABLE';
  end if;

  update public.inventory_reservations set status = 'EXPIRED', updated_at = now()
  where order_id = p_order_id and status = 'ACTIVE' and expires_at <= now();

  select max(expires_at) into v_existing_expiry
  from public.inventory_reservations
  where order_id = p_order_id and status = 'ACTIVE' and expires_at > now();
  if v_existing_expiry is not null then return v_existing_expiry; end if;

  if exists (select 1 from public.inventory_reservations where order_id = p_order_id and status = 'COMMITTED') then
    raise exception using errcode = 'P0001', message = 'INVENTORY_ALREADY_COMMITTED';
  end if;
  if not exists (select 1 from public.order_items where order_id = p_order_id) then
    raise exception using errcode = 'P0001', message = 'ORDER_HAS_NO_ITEMS';
  end if;

  -- Null product references are valid only for the non-catalogue custom-cake line
  -- created by create_order_from_accepted_quote.
  if exists (
    select 1 from public.order_items
    where order_id = p_order_id
      and product_id is null
      and (
        coalesce(product_snapshot->>'type', '') <> 'CUSTOM_CAKE'
        or variant_id is not null
        or not exists (
          select 1
          from public.custom_cake_orders cake
          join public.business_documents document on document.cake_order_id = cake.id
          where cake.order_id = p_order_id
            and cake.id::text = order_items.product_snapshot->>'cakeOrderId'
            and document.id::text = order_items.product_snapshot->>'quoteDocumentId'
            and document.kind = 'QUOTE' and document.state = 'ACCEPTED'
        )
      )
  ) then
    raise exception using errcode = 'P0001', message = 'PRODUCT_UNAVAILABLE';
  end if;

  for item in
    select oi.product_id, sum(oi.quantity)::integer as quantity
    from public.order_items oi
    where oi.order_id = p_order_id and oi.product_id is not null
    group by oi.product_id order by oi.product_id
  loop
    select track_inventory, stock_quantity, status into v_tracked, v_stock, v_status
    from public.products where id = item.product_id for update;
    if not found or v_status in ('DRAFT', 'ARCHIVED', 'OUT_OF_STOCK') then
      raise exception using errcode = 'P0001', message = 'PRODUCT_UNAVAILABLE';
    end if;
    if v_tracked then
      select coalesce(sum(quantity), 0)::integer into v_reserved
      from public.inventory_reservations
      where product_id = item.product_id and order_id <> p_order_id
        and status = 'ACTIVE' and expires_at > now();
      if v_stock - v_reserved < item.quantity then
        raise exception using errcode = 'P0001', message = 'INSUFFICIENT_STOCK';
      end if;
    end if;
  end loop;

  for item in
    select oi.product_id, oi.variant_id, sum(oi.quantity)::integer as quantity
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id and p.track_inventory = true
    group by oi.product_id, oi.variant_id order by oi.product_id, oi.variant_id
  loop
    if item.variant_id is null then
      raise exception using errcode = 'P0001', message = 'VARIANT_UNAVAILABLE';
    end if;
    select stock_quantity, active into v_stock, v_active
    from public.product_variants
    where id = item.variant_id and product_id = item.product_id for update;
    if not found or not v_active then
      raise exception using errcode = 'P0001', message = 'VARIANT_UNAVAILABLE';
    end if;
    select coalesce(sum(quantity), 0)::integer into v_reserved
    from public.inventory_reservations
    where variant_id = item.variant_id and order_id <> p_order_id
      and status = 'ACTIVE' and expires_at > now();
    if v_stock - v_reserved < item.quantity then
      raise exception using errcode = 'P0001', message = 'INSUFFICIENT_STOCK';
    end if;
  end loop;

  v_expires_at := now() + make_interval(mins => p_hold_minutes);
  insert into public.inventory_reservations (
    order_id, order_item_id, product_id, variant_id, quantity, status,
    expires_at, committed_at, released_at, updated_at
  )
  select oi.order_id, oi.id, oi.product_id, oi.variant_id, oi.quantity, 'ACTIVE',
    v_expires_at, null, null, now()
  from public.order_items oi
  join public.products p on p.id = oi.product_id
  where oi.order_id = p_order_id and p.track_inventory = true
  on conflict (order_item_id) do update set
    quantity = excluded.quantity, status = 'ACTIVE', expires_at = excluded.expires_at,
    committed_at = null, released_at = null, updated_at = now();
  return v_expires_at;
end;
$$;

create or replace function public.protect_linked_cake_status()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_order_status public.order_status;
  v_expected public.cake_status;
begin
  if tg_op = 'UPDATE' and old.order_id is not null and new.order_id is distinct from old.order_id then
    raise exception using errcode = 'P0001', message = 'LINKED_ORDER_STATUS_AUTHORITATIVE';
  end if;
  if new.order_id is null then return new; end if;
  select status into v_order_status from public.orders where id = new.order_id;
  v_expected := case v_order_status
    when 'PENDING_PAYMENT' then 'PENDING_PAYMENT'::public.cake_status
    when 'PAID' then 'PAID'::public.cake_status
    when 'CONFIRMED' then 'CONFIRMED'::public.cake_status
    when 'PREPARING' then 'PREPARING'::public.cake_status
    when 'READY' then 'READY'::public.cake_status
    when 'OUT_FOR_DELIVERY' then 'OUT_FOR_DELIVERY'::public.cake_status
    when 'DELIVERED' then 'DELIVERED'::public.cake_status
    when 'CANCELLED' then 'CANCELLED'::public.cake_status
    when 'REFUNDED' then 'REFUNDED'::public.cake_status
    else new.status
  end;
  if new.status <> v_expected then
    raise exception using errcode = 'P0001', message = 'LINKED_ORDER_STATUS_AUTHORITATIVE';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_linked_cake_status on public.custom_cake_orders;
create trigger protect_linked_cake_status
before insert or update of status, order_id on public.custom_cake_orders
for each row execute function public.protect_linked_cake_status();

alter table public.document_events drop constraint if exists document_events_action_check;
alter table public.document_events add constraint document_events_action_check check (action in (
  'QUOTE_ISSUED','QUOTE_REVISED','QUOTE_ACCEPTED','QUOTE_DECLINED',
  'INVOICE_ISSUED','INVOICE_SENT','RECEIPT_ISSUED','RECEIPT_SENT',
  'DOCUMENT_TOKEN_REVOKED','DOCUMENT_PRESENTATION_UPDATED'
));

create or replace function public.guard_business_document_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'BUSINESS_DOCUMENTS_ARE_IMMUTABLE';
  end if;
  if old.id <> new.id or old.kind <> new.kind or old.number <> new.number
    or old.order_id is distinct from new.order_id or old.cake_order_id is distinct from new.cake_order_id
    or old.revision <> new.revision or old.issued_at <> new.issued_at
    or old.valid_until is distinct from new.valid_until or old.due_at is distinct from new.due_at
    or old.business_snapshot <> new.business_snapshot or old.customer_snapshot <> new.customer_snapshot
    or old.line_items_snapshot <> new.line_items_snapshot or old.totals_snapshot <> new.totals_snapshot
    or old.branding_snapshot <> new.branding_snapshot
    or old.supersedes_document_id is distinct from new.supersedes_document_id
    or old.created_by is distinct from new.created_by or old.created_at <> new.created_at
    or (old.state <> new.state and coalesce(current_setting('app.document_lifecycle', true), '') <> 'allowed')
    or (old.presentation_snapshot <> new.presentation_snapshot
      and coalesce(current_setting('app.document_presentation', true), '') <> 'allowed')
  then
    raise exception using errcode = 'P0001', message = 'BUSINESS_DOCUMENTS_ARE_IMMUTABLE';
  end if;
  return new;
end;
$$;

create or replace function public.update_document_presentation(
  p_document_id uuid,
  p_presentation jsonb,
  p_admin_id uuid
)
returns public.business_documents
language plpgsql
security definer
set search_path = ''
as $$
declare v_document public.business_documents;
begin
  if jsonb_typeof(p_presentation) <> 'object'
    or p_presentation - array['notes','footerMessage','design','accentColor','showSku','showBusinessTaxNumber','showPaymentDetails','payNowUrl'] <> '{}'::jsonb
    or coalesce(p_presentation->>'design', '') not in ('classic','modern','minimal')
  then
    raise exception using errcode = '22023', message = 'INVALID_DOCUMENT_PRESENTATION';
  end if;
  perform set_config('app.document_presentation', 'allowed', true);
  update public.business_documents set presentation_snapshot = p_presentation
  where id = p_document_id returning * into v_document;
  if v_document.id is null then raise exception using errcode = 'P0002', message = 'DOCUMENT_NOT_FOUND'; end if;
  insert into public.document_events(document_id, action, actor_admin_id)
  values (p_document_id, 'DOCUMENT_PRESENTATION_UPDATED', p_admin_id);
  return v_document;
end;
$$;

create table if not exists public.document_deliveries (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.business_documents(id) on delete cascade,
  recipient text not null,
  status text not null default 'PENDING' check (status in ('PENDING','SENDING','SENT','FAILED')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(document_id, recipient)
);
create index if not exists document_deliveries_pending_idx
on public.document_deliveries(status, next_attempt_at);
alter table public.document_deliveries enable row level security;
revoke all on table public.document_deliveries from public, anon, authenticated;
grant select, insert, update on table public.document_deliveries to service_role;

revoke all on function public.update_document_presentation(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.protect_linked_cake_status() from public, anon, authenticated;
grant execute on function public.update_document_presentation(uuid, jsonb, uuid) to service_role;

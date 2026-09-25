-- Transactional inventory reservations, payment-stage deductions, and restoration.
-- Product rows are locked before availability is checked so concurrent checkouts
-- cannot reserve the same units.

do $$
begin
  create type public.inventory_reservation_status as enum ('ACTIVE', 'COMMITTED', 'RELEASED', 'EXPIRED');
exception
  when duplicate_object then null;
end
$$;

alter table public.orders
  add column if not exists inventory_restored_at timestamptz;

create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  status public.inventory_reservation_status not null default 'ACTIVE',
  expires_at timestamptz not null,
  committed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_item_id)
);

create index if not exists inventory_reservations_product_active_idx
  on public.inventory_reservations(product_id, expires_at)
  where status = 'ACTIVE';
create index if not exists inventory_reservations_variant_active_idx
  on public.inventory_reservations(variant_id, expires_at)
  where status = 'ACTIVE';
create index if not exists inventory_reservations_order_idx
  on public.inventory_reservations(order_id, status);

alter table public.inventory_reservations enable row level security;
revoke all on table public.inventory_reservations from anon, authenticated;

create or replace function public.protect_reserved_inventory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserved integer;
begin
  if tg_table_name = 'products' then
    select coalesce(sum(quantity), 0)::integer
      into v_reserved
      from public.inventory_reservations
      where product_id = new.id and status = 'ACTIVE' and expires_at > now();
  else
    select coalesce(sum(quantity), 0)::integer
      into v_reserved
      from public.inventory_reservations
      where variant_id = new.id and status = 'ACTIVE' and expires_at > now();
  end if;

  if new.stock_quantity < v_reserved then
    raise exception using errcode = 'P0001', message = 'STOCK_BELOW_RESERVED';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_product_reserved_inventory on public.products;
create trigger protect_product_reserved_inventory
  before update of stock_quantity on public.products
  for each row
  when (old.stock_quantity is distinct from new.stock_quantity)
  execute function public.protect_reserved_inventory();

drop trigger if exists protect_variant_reserved_inventory on public.product_variants;
create trigger protect_variant_reserved_inventory
  before update of stock_quantity on public.product_variants
  for each row
  when (old.stock_quantity is distinct from new.stock_quantity)
  execute function public.protect_reserved_inventory();

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

  select status
    into v_order_status
    from public.orders
    where id = p_order_id
    for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;
  if v_order_status <> 'PENDING_PAYMENT' then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_RESERVABLE';
  end if;

  update public.inventory_reservations
    set status = 'EXPIRED', updated_at = now()
    where order_id = p_order_id and status = 'ACTIVE' and expires_at <= now();

  select max(expires_at)
    into v_existing_expiry
    from public.inventory_reservations
    where order_id = p_order_id and status = 'ACTIVE' and expires_at > now();
  if v_existing_expiry is not null then
    return v_existing_expiry;
  end if;

  if exists (
    select 1 from public.inventory_reservations
    where order_id = p_order_id and status = 'COMMITTED'
  ) then
    raise exception using errcode = 'P0001', message = 'INVENTORY_ALREADY_COMMITTED';
  end if;

  if not exists (select 1 from public.order_items where order_id = p_order_id) then
    raise exception using errcode = 'P0001', message = 'ORDER_HAS_NO_ITEMS';
  end if;

  -- Lock products in a stable order. Every reservation for a product must obtain
  -- this lock before reading reservation totals or inserting new holds.
  for item in
    select oi.product_id, sum(oi.quantity)::integer as quantity
    from public.order_items oi
    where oi.order_id = p_order_id
    group by oi.product_id
    order by oi.product_id
  loop
    if item.product_id is null then
      raise exception using errcode = 'P0001', message = 'PRODUCT_UNAVAILABLE';
    end if;

    select track_inventory, stock_quantity, status
      into v_tracked, v_stock, v_status
      from public.products
      where id = item.product_id
      for update;

    if not found or v_status in ('DRAFT', 'ARCHIVED', 'OUT_OF_STOCK') then
      raise exception using errcode = 'P0001', message = 'PRODUCT_UNAVAILABLE';
    end if;

    if v_tracked then
      select coalesce(sum(quantity), 0)::integer
        into v_reserved
        from public.inventory_reservations
        where product_id = item.product_id
          and order_id <> p_order_id
          and status = 'ACTIVE'
          and expires_at > now();

      if v_stock - v_reserved < item.quantity then
        raise exception using errcode = 'P0001', message = 'INSUFFICIENT_STOCK';
      end if;
    end if;
  end loop;

  -- Lock and validate variants after products, also in a stable order.
  for item in
    select oi.product_id, oi.variant_id, sum(oi.quantity)::integer as quantity
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id and p.track_inventory = true
    group by oi.product_id, oi.variant_id
    order by oi.product_id, oi.variant_id
  loop
    if item.variant_id is null then
      raise exception using errcode = 'P0001', message = 'VARIANT_UNAVAILABLE';
    end if;

    select stock_quantity, active
      into v_stock, v_active
      from public.product_variants
      where id = item.variant_id and product_id = item.product_id
      for update;

    if not found or not v_active then
      raise exception using errcode = 'P0001', message = 'VARIANT_UNAVAILABLE';
    end if;

    select coalesce(sum(quantity), 0)::integer
      into v_reserved
      from public.inventory_reservations
      where variant_id = item.variant_id
        and order_id <> p_order_id
        and status = 'ACTIVE'
        and expires_at > now();

    if v_stock - v_reserved < item.quantity then
      raise exception using errcode = 'P0001', message = 'INSUFFICIENT_STOCK';
    end if;
  end loop;

  v_expires_at := now() + make_interval(mins => p_hold_minutes);

  insert into public.inventory_reservations (
    order_id, order_item_id, product_id, variant_id, quantity, status,
    expires_at, committed_at, released_at, updated_at
  )
  select
    oi.order_id, oi.id, oi.product_id, oi.variant_id, oi.quantity, 'ACTIVE',
    v_expires_at, null, null, now()
  from public.order_items oi
  join public.products p on p.id = oi.product_id
  where oi.order_id = p_order_id and p.track_inventory = true
  on conflict (order_item_id) do update set
    quantity = excluded.quantity,
    status = 'ACTIVE',
    expires_at = excluded.expires_at,
    committed_at = null,
    released_at = null,
    updated_at = now();

  return v_expires_at;
end;
$$;

create or replace function public.commit_order_inventory(p_order_number text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_deducted_at timestamptz;
  v_expected integer;
  v_reserved integer;
  item record;
begin
  select id, inventory_deducted_at
    into v_order_id, v_deducted_at
    from public.orders
    where order_number = p_order_number
    for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;
  if v_deducted_at is not null then
    return;
  end if;

  update public.inventory_reservations
    set status = 'EXPIRED', updated_at = now()
    where order_id = v_order_id and status = 'ACTIVE' and expires_at <= now();

  select count(*)::integer
    into v_expected
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = v_order_id and p.track_inventory = true;
  select count(*)::integer
    into v_reserved
    from public.inventory_reservations
    where order_id = v_order_id and status = 'ACTIVE' and expires_at > now();

  if v_expected <> v_reserved then
    raise exception using errcode = 'P0001', message = 'INVENTORY_RESERVATION_MISSING';
  end if;

  -- Move this order out of ACTIVE before decrementing. The stock-protection
  -- triggers continue to guard units held by every other pending order.
  update public.inventory_reservations
    set status = 'COMMITTED', committed_at = now(), updated_at = now()
    where order_id = v_order_id and status = 'ACTIVE';

  for item in
    select product_id, sum(quantity)::integer as quantity
    from public.inventory_reservations
    where order_id = v_order_id and status = 'COMMITTED'
    group by product_id
    order by product_id
  loop
    perform 1 from public.products where id = item.product_id for update;
    update public.products
      set stock_quantity = stock_quantity - item.quantity, updated_at = now()
      where id = item.product_id and stock_quantity >= item.quantity;
    if not found then
      raise exception using errcode = 'P0001', message = 'INSUFFICIENT_STOCK';
    end if;
  end loop;

  for item in
    select product_id, variant_id, sum(quantity)::integer as quantity
    from public.inventory_reservations
    where order_id = v_order_id and status = 'COMMITTED'
    group by product_id, variant_id
    order by product_id, variant_id
  loop
    perform 1 from public.product_variants where id = item.variant_id for update;
    update public.product_variants
      set stock_quantity = stock_quantity - item.quantity, updated_at = now()
      where id = item.variant_id and product_id = item.product_id and stock_quantity >= item.quantity;
    if not found then
      raise exception using errcode = 'P0001', message = 'INSUFFICIENT_STOCK';
    end if;
  end loop;

  update public.products p
    set status = case
      when p.stock_quantity = 0 or not exists (
        select 1 from public.product_variants pv
        where pv.product_id = p.id and pv.active = true and pv.stock_quantity > 0
      ) then 'OUT_OF_STOCK'::public.product_status
      else p.status
    end,
    updated_at = now()
    where p.id in (
      select product_id from public.inventory_reservations
      where order_id = v_order_id and status = 'COMMITTED'
    );
  update public.orders
    set inventory_deducted_at = now(), inventory_restored_at = null, updated_at = now()
    where id = v_order_id;
end;
$$;

create or replace function public.release_order_inventory(p_order_number text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  item record;
begin
  select id
    into v_order_id
    from public.orders
    where order_number = p_order_number
    for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;

  for item in
    select product_id, sum(quantity)::integer as quantity
    from public.inventory_reservations
    where order_id = v_order_id and status = 'COMMITTED'
    group by product_id
    order by product_id
  loop
    perform 1 from public.products where id = item.product_id for update;
    update public.products
      set stock_quantity = stock_quantity + item.quantity, updated_at = now()
      where id = item.product_id;
  end loop;

  for item in
    select product_id, variant_id, sum(quantity)::integer as quantity
    from public.inventory_reservations
    where order_id = v_order_id and status = 'COMMITTED'
    group by product_id, variant_id
    order by product_id, variant_id
  loop
    perform 1 from public.product_variants where id = item.variant_id for update;
    update public.product_variants
      set stock_quantity = stock_quantity + item.quantity, updated_at = now()
      where id = item.variant_id and product_id = item.product_id;
  end loop;

  update public.products p
    set status = case
      when p.status = 'OUT_OF_STOCK' and p.stock_quantity > 0 and exists (
        select 1 from public.product_variants pv
        where pv.product_id = p.id and pv.active = true and pv.stock_quantity > 0
      ) then 'ACTIVE'::public.product_status
      else p.status
    end,
    updated_at = now()
    where p.id in (
      select product_id from public.inventory_reservations
      where order_id = v_order_id and status = 'COMMITTED'
    );

  update public.inventory_reservations
    set status = 'RELEASED', released_at = now(), updated_at = now()
    where order_id = v_order_id and status in ('ACTIVE', 'COMMITTED');

  if found then
    update public.orders
      set inventory_restored_at = case
        when inventory_deducted_at is not null then now()
        else inventory_restored_at
      end,
      updated_at = now()
      where id = v_order_id;
  end if;
end;
$$;

create or replace function public.transition_order_status(
  p_order_number text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.order_status;
  v_order_id uuid;
  v_deducted_at timestamptz;
begin
  if p_status not in (
    'PAID', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY',
    'DELIVERED', 'CANCELLED', 'REFUNDED', 'FAILED'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_STATUS';
  end if;

  v_status := p_status::public.order_status;

  select id, inventory_deducted_at
    into v_order_id, v_deducted_at
    from public.orders
    where order_number = p_order_number
    for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;

  if v_status = 'PAID' and v_deducted_at is null then
    perform public.reserve_order_inventory(v_order_id, 15);
    perform public.commit_order_inventory(p_order_number);
  elsif v_status in ('CANCELLED', 'REFUNDED', 'FAILED') then
    perform public.release_order_inventory(p_order_number);
  elsif v_deducted_at is null then
    raise exception using errcode = 'P0001', message = 'INVENTORY_NOT_COMMITTED';
  end if;

  update public.orders
    set status = v_status, updated_at = now()
    where order_number = p_order_number;
end;
$$;

create or replace function public.set_product_inventory(
  p_product_id uuid,
  p_quantity integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserved integer;
begin
  if p_quantity < 0 then
    raise exception using errcode = '22023', message = 'INVALID_STOCK_QUANTITY';
  end if;

  perform 1 from public.products where id = p_product_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND';
  end if;

  select coalesce(sum(quantity), 0)::integer
    into v_reserved
    from public.inventory_reservations
    where product_id = p_product_id
      and status = 'ACTIVE'
      and expires_at > now();

  if p_quantity < v_reserved then
    raise exception using errcode = 'P0001', message = 'STOCK_BELOW_RESERVED';
  end if;

  update public.products
    set stock_quantity = p_quantity,
      status = case
        when p_quantity = 0 then 'OUT_OF_STOCK'::public.product_status
        when status = 'OUT_OF_STOCK' then 'ACTIVE'::public.product_status
        else status
      end,
      updated_at = now()
    where id = p_product_id;
end;
$$;

revoke all on function public.reserve_order_inventory(uuid, integer) from public, anon, authenticated;
revoke all on function public.commit_order_inventory(text) from public, anon, authenticated;
revoke all on function public.release_order_inventory(text) from public, anon, authenticated;
revoke all on function public.transition_order_status(text, text) from public, anon, authenticated;
revoke all on function public.set_product_inventory(uuid, integer) from public, anon, authenticated;
revoke all on function public.protect_reserved_inventory() from public, anon, authenticated;
grant execute on function public.reserve_order_inventory(uuid, integer) to service_role;
grant execute on function public.commit_order_inventory(text) to service_role;
grant execute on function public.release_order_inventory(text) to service_role;
grant execute on function public.transition_order_status(text, text) to service_role;
grant execute on function public.set_product_inventory(uuid, integer) to service_role;
grant select, insert, update, delete on table public.inventory_reservations to service_role;

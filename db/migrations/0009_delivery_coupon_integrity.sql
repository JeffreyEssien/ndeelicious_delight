-- Delivery settings and concurrency-safe coupon reservations.

update public.site_settings
set
  value = jsonb_set(
    jsonb_set(
      jsonb_set(
        value,
        '{deliveryEnabled}',
        coalesce(value -> 'deliveryEnabled', 'true'::jsonb),
        true
      ),
      '{pickupEnabled}',
      coalesce(value -> 'pickupEnabled', 'true'::jsonb),
      true
    ),
    '{orderMinimum}',
    coalesce(value -> 'orderMinimum', '0'::jsonb),
    true
  ),
  updated_at = now()
where key = 'business';

alter table public.coupon_usages
  add column if not exists expires_at timestamptz,
  add column if not exists committed_at timestamptz,
  add column if not exists released_at timestamptz;

update public.coupon_usages usage
set
  expires_at = case
    when orders.status = 'PENDING_PAYMENT' then coalesce(usage.expires_at, usage.created_at + interval '15 minutes')
    else null
  end,
  committed_at = case
    when orders.status in ('PAID', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED')
      then coalesce(usage.committed_at, usage.created_at)
    else null
  end,
  released_at = case
    when orders.status in ('CANCELLED', 'REFUNDED', 'FAILED') then coalesce(usage.released_at, orders.updated_at)
    else null
  end
from public.orders orders
where orders.id = usage.order_id;

create unique index if not exists coupon_usages_order_idx
  on public.coupon_usages(order_id);
create index if not exists coupon_usages_active_limit_idx
  on public.coupon_usages(coupon_id, customer_id, expires_at)
  where released_at is null;

create or replace function public.claim_order_coupon(
  p_order_id uuid,
  p_hold_minutes integer default 15
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_coupon record;
  v_usage_count integer;
  v_customer_count integer;
  v_eligible integer;
  v_expected_discount integer;
begin
  if p_hold_minutes < 1 or p_hold_minutes > 60 then
    raise exception using errcode = '22023', message = 'INVALID_HOLD_DURATION';
  end if;

  select id, coupon_id, customer_id, subtotal, discount_total, status
    into v_order
    from public.orders
    where id = p_order_id
    for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;
  if v_order.coupon_id is null or v_order.discount_total = 0 then
    return;
  end if;
  if v_order.status <> 'PENDING_PAYMENT' then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_RESERVABLE';
  end if;

  select *
    into v_coupon
    from public.coupons
    where id = v_order.coupon_id
    for update;

  if not found or not v_coupon.active then
    raise exception using errcode = 'P0001', message = 'COUPON_INACTIVE';
  end if;
  if v_coupon.starts_at is not null and now() < v_coupon.starts_at then
    raise exception using errcode = 'P0001', message = 'COUPON_NOT_STARTED';
  end if;
  if v_coupon.expires_at is not null and now() > v_coupon.expires_at then
    raise exception using errcode = 'P0001', message = 'COUPON_EXPIRED';
  end if;
  if v_order.subtotal < v_coupon.minimum_order then
    raise exception using errcode = 'P0001', message = 'COUPON_MINIMUM';
  end if;

  select count(*)::integer
    into v_usage_count
    from public.coupon_usages
    where coupon_id = v_coupon.id
      and order_id <> p_order_id
      and released_at is null
      and (committed_at is not null or expires_at > now());
  if v_coupon.usage_limit is not null and v_usage_count >= v_coupon.usage_limit then
    raise exception using errcode = 'P0001', message = 'COUPON_USED_UP';
  end if;

  if v_coupon.per_customer_limit is not null then
    select count(*)::integer
      into v_customer_count
      from public.coupon_usages
      where coupon_id = v_coupon.id
        and customer_id = v_order.customer_id
        and order_id <> p_order_id
        and released_at is null
        and (committed_at is not null or expires_at > now());
    if v_customer_count >= v_coupon.per_customer_limit then
      raise exception using errcode = 'P0001', message = 'COUPON_CUSTOMER_LIMIT';
    end if;
  end if;

  select coalesce(sum(oi.final_price), 0)::integer
    into v_eligible
    from public.order_items oi
    left join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id
      and (
        coalesce(cardinality(v_coupon.product_ids), 0) = 0
        or oi.product_id = any(v_coupon.product_ids)
      )
      and (
        coalesce(cardinality(v_coupon.category_ids), 0) = 0
        or p.category_id = any(v_coupon.category_ids)
      );

  if v_eligible = 0 then
    raise exception using errcode = 'P0001', message = 'COUPON_NOT_APPLICABLE';
  end if;

  v_expected_discount := case
    when v_coupon.type = 'PERCENTAGE' then floor(v_eligible * v_coupon.value / 100.0)::integer
    else v_coupon.value
  end;
  v_expected_discount := least(
    v_expected_discount,
    coalesce(v_coupon.maximum_discount, v_expected_discount),
    v_eligible
  );

  if v_order.discount_total <> v_expected_discount then
    raise exception using errcode = 'P0001', message = 'COUPON_AMOUNT_CHANGED';
  end if;

  insert into public.coupon_usages (
    coupon_id, order_id, customer_id, discount_amount, expires_at, committed_at, released_at
  ) values (
    v_coupon.id,
    p_order_id,
    v_order.customer_id,
    v_expected_discount,
    now() + make_interval(mins => p_hold_minutes),
    null,
    null
  )
  on conflict (order_id) do update set
    coupon_id = excluded.coupon_id,
    customer_id = excluded.customer_id,
    discount_amount = excluded.discount_amount,
    expires_at = excluded.expires_at,
    committed_at = null,
    released_at = null;
end;
$$;

create or replace function public.sync_order_coupon_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'PAID' and old.status is distinct from new.status then
    update public.coupon_usages
      set committed_at = now(), expires_at = null, released_at = null
      where order_id = new.id;
  elsif new.status in ('CANCELLED', 'REFUNDED', 'FAILED') and old.status is distinct from new.status then
    update public.coupon_usages
      set released_at = now(), expires_at = null
      where order_id = new.id and released_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_order_coupon_usage on public.orders;
create trigger sync_order_coupon_usage
  after update of status on public.orders
  for each row
  execute function public.sync_order_coupon_usage();

revoke all on function public.claim_order_coupon(uuid, integer) from public, anon, authenticated;
revoke all on function public.sync_order_coupon_usage() from public, anon, authenticated;
grant execute on function public.claim_order_coupon(uuid, integer) to service_role;

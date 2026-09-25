-- Every sellable inventory unit (product variant) receives a stable SKU.
-- Product stock is an aggregate of active variant stock and cannot drift.

create sequence if not exists public.inventory_sku_sequence;

create or replace function public.next_inventory_sku()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'NDE-' || lpad(nextval('public.inventory_sku_sequence')::text, 8, '0');
$$;

update public.product_variants
set sku = public.next_inventory_sku()
where sku is null or trim(sku) = '';

alter table public.product_variants alter column sku set not null;

create or replace function public.enforce_inventory_sku()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.sku := public.next_inventory_sku();
  elsif new.sku is distinct from old.sku then
    raise exception using errcode = 'P0001', message = 'INVENTORY_SKU_IS_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_inventory_sku on public.product_variants;
create trigger enforce_inventory_sku
before insert or update of sku on public.product_variants
for each row execute function public.enforce_inventory_sku();

create or replace function public.sync_product_stock_from_variants()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_product_id uuid := coalesce(new.product_id, old.product_id);
  v_quantity integer;
begin
  select coalesce(sum(stock_quantity) filter (where active), 0)::integer
    into v_quantity
    from public.product_variants
    where product_id = v_product_id;

  update public.products
  set stock_quantity = v_quantity,
      status = case
        when status = 'ACTIVE' and v_quantity = 0 then 'OUT_OF_STOCK'::public.product_status
        when status = 'OUT_OF_STOCK' and v_quantity > 0 then 'ACTIVE'::public.product_status
        else status
      end,
      updated_at = now()
  where id = v_product_id;
  return null;
end;
$$;

drop trigger if exists sync_product_stock_from_variants on public.product_variants;
create trigger sync_product_stock_from_variants
after insert or delete or update of stock_quantity, active on public.product_variants
for each row execute function public.sync_product_stock_from_variants();

update public.products products
set stock_quantity = coalesce((
  select sum(variants.stock_quantity) filter (where variants.active)
  from public.product_variants variants
  where variants.product_id = products.id
), 0),
updated_at = now();

create or replace function public.set_variant_inventory(
  p_product_id uuid,
  p_variant_id uuid,
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

  perform 1
  from public.product_variants
  where id = p_variant_id and product_id = p_product_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'VARIANT_NOT_FOUND';
  end if;

  select coalesce(sum(quantity), 0)::integer
    into v_reserved
    from public.inventory_reservations
    where variant_id = p_variant_id
      and status = 'ACTIVE'
      and expires_at > now();

  if p_quantity < v_reserved then
    raise exception using errcode = 'P0001', message = 'STOCK_BELOW_RESERVED';
  end if;

  update public.product_variants
  set stock_quantity = p_quantity, updated_at = now()
  where id = p_variant_id;
end;
$$;

revoke all on function public.next_inventory_sku() from public, anon, authenticated;
grant execute on function public.next_inventory_sku() to service_role;
revoke all on function public.enforce_inventory_sku() from public, anon, authenticated;
revoke all on function public.sync_product_stock_from_variants() from public, anon, authenticated;
revoke all on sequence public.inventory_sku_sequence from public, anon, authenticated;
grant usage, select on sequence public.inventory_sku_sequence to service_role;
revoke all on function public.set_variant_inventory(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.set_variant_inventory(uuid, uuid, integer) to service_role;

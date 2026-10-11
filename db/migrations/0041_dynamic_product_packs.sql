begin;
-- Nullable tracking inherits the product policy for existing variants. No sizes
-- or commercial prices are guessed for legacy records.
alter table public.product_variants
  add column sort_order integer not null default 0 check (sort_order >= 0),
  add column track_inventory boolean,
  add column retired_at timestamptz,
  add constraint retired_variant_unavailable check (retired_at is null or not active);
with ranked as (
 select id,row_number() over(partition by product_id order by created_at,id)-1 as position
 from public.product_variants
) update public.product_variants v set sort_order=r.position from ranked r where v.id=r.id;
create index variants_display_order_idx on public.product_variants(product_id,sort_order,id);

-- Reservations on a retired pack remain fulfilable. Untracked packs never
-- turn an otherwise published product into OUT_OF_STOCK merely because stock=0.
create or replace function public.sync_product_stock_from_variants() returns trigger
language plpgsql set search_path='' as $$
declare v_id uuid:=coalesce(new.product_id,old.product_id); v_quantity integer; v_available boolean;
begin
 select coalesce(sum(v.stock_quantity) filter(where v.active or exists(
   select 1 from public.inventory_reservations r where r.variant_id=v.id and r.status='ACTIVE' and r.expires_at>now())),0)::integer,
   coalesce(bool_or(v.active and v.retired_at is null and (p.shopping_mode<>'MADE_TO_ORDER' or (v.pack_quantity>0 and coalesce(p.discount_price,p.base_price)::bigint+v.price_adjustment>0)) and (not coalesce(v.track_inventory,p.track_inventory) or v.stock_quantity>0)),false)
 into v_quantity,v_available from public.product_variants v join public.products p on p.id=v.product_id where v.product_id=v_id;
 update public.products set stock_quantity=v_quantity,status=case
   when status='ACTIVE' and not v_available then 'OUT_OF_STOCK'::public.product_status
   when status='OUT_OF_STOCK' and v_available then 'ACTIVE'::public.product_status else status end,updated_at=now() where id=v_id;
 return null;
end $$;
drop trigger sync_product_stock_from_variants on public.product_variants;
create trigger sync_product_stock_from_variants after insert or delete or update of stock_quantity,active,track_inventory,retired_at
on public.product_variants for each row execute function public.sync_product_stock_from_variants();

create or replace function public.admin_save_product(
 p_id uuid,p_product jsonb,p_variants jsonb,p_images jsonb,p_admin_id uuid,p_session_id uuid
) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid:=coalesce(p_id,gen_random_uuid()); v_product public.products;
 v_variant public.product_variants; item jsonb; v_variant_id uuid; v_before jsonb; v_after jsonb; v_base integer;
begin
 if jsonb_typeof(p_variants)<>'array' or jsonb_typeof(p_images)<>'array' then raise exception 'INVALID_PRODUCT'; end if;
 if p_id is not null then
   select * into v_product from public.products where id=p_id for update;
   if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
   select to_jsonb(p)||jsonb_build_object('product_variants',coalesce((select jsonb_agg(to_jsonb(v) order by v.sort_order,v.id) from public.product_variants v where v.product_id=p.id),'[]'::jsonb)) into v_before from public.products p where p.id=p_id;
 end if;
 -- Always lock products before their variants, as the reservation functions do.
 perform 1 from public.product_variants where product_id=v_id order by id for update;
 for item in select value from jsonb_array_elements(p_variants) loop
   if item->>'id' is not null then
     select * into v_variant from public.product_variants where id=(item->>'id')::uuid;
     if found then
       if v_variant.product_id<>v_id or v_variant.retired_at is not null then raise exception 'VARIANT_OWNERSHIP'; end if;
       if (item->>'expectedStockQuantity' is not null and v_variant.stock_quantity<>(item->>'expectedStockQuantity')::integer) or (item->>'expectedStockQuantity' is null and v_variant.stock_quantity<>(item->>'stockQuantity')::integer) then raise exception 'INVENTORY_CHANGED'; end if;
     end if;
   end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_images) i where not exists(
   select 1 from public.product_images image where image.id=(i->>'id')::uuid and image.product_id=v_id)) then raise exception 'IMAGE_OWNERSHIP'; end if;
 if exists(select 1 from jsonb_array_elements(p_variants) v where v->>'id' is not null group by v->>'id' having count(*)>1) then raise exception 'DUPLICATE_VARIANT'; end if;
 v_product:=jsonb_populate_record(v_product,p_product);
 v_base:=coalesce(v_product.discount_price,v_product.base_price);
 if v_product.discount_price>v_product.base_price then raise exception 'INVALID_DISCOUNT_PRICE'; end if;
 if exists(select 1 from jsonb_array_elements(p_variants) v where v_base::bigint+(v->>'priceAdjustment')::bigint<0) then raise exception 'INVALID_PACK_PRICE'; end if;
 if v_product.shopping_mode='MADE_TO_ORDER' then
   if exists(select 1 from jsonb_array_elements(p_variants) v where (v->>'active')::boolean and
      (coalesce((v->>'packQuantity')::integer,0)<=0 or v_base::bigint+(v->>'priceAdjustment')::bigint<=0)) then raise exception 'COMPLETE_PUBLISHED_PACKS'; end if;
   if exists(select 1 from jsonb_array_elements(p_variants) v where (v->>'active')::boolean group by v->>'packQuantity' having count(*)>1) then raise exception 'DUPLICATE_ACTIVE_PACK_SIZE'; end if;
 end if;
 if v_product.status='ACTIVE' and not exists(select 1 from jsonb_array_elements(p_variants) v where (v->>'active')::boolean) then raise exception 'PUBLISHED_PACK_REQUIRED'; end if;
 if p_id is null then
   insert into public.products(id,category_id,name,slug,short_description,description,base_price,discount_price,status,featured,track_inventory,low_stock_threshold,ingredients,allergens,storage_instructions,preparation_instructions,shopping_mode,tax_class,preparation_hours)
   values(v_id,v_product.category_id,v_product.name,v_product.slug,v_product.short_description,v_product.description,v_product.base_price,v_product.discount_price,'DRAFT',v_product.featured,v_product.track_inventory,v_product.low_stock_threshold,v_product.ingredients,v_product.allergens,v_product.storage_instructions,v_product.preparation_instructions,v_product.shopping_mode,v_product.tax_class,v_product.preparation_hours);
 else
   -- DRAFT is transaction-local while variants and prices are replaced together.
   update public.products set category_id=v_product.category_id,name=v_product.name,slug=v_product.slug,short_description=v_product.short_description,description=v_product.description,
   base_price=v_product.base_price,discount_price=v_product.discount_price,status='DRAFT',featured=v_product.featured,track_inventory=v_product.track_inventory,low_stock_threshold=v_product.low_stock_threshold,ingredients=v_product.ingredients,allergens=v_product.allergens,storage_instructions=v_product.storage_instructions,preparation_instructions=v_product.preparation_instructions,shopping_mode=v_product.shopping_mode,tax_class=v_product.tax_class,preparation_hours=v_product.preparation_hours,updated_at=now() where id=v_id;
 end if;
 update public.product_variants set active=false,retired_at=coalesce(retired_at,now()),updated_at=now() where product_id=v_id
   and id not in(select (v->>'id')::uuid from jsonb_array_elements(p_variants) v where v->>'id' is not null);
 for item in select value from jsonb_array_elements(p_variants) loop
   v_variant_id:=coalesce((item->>'id')::uuid,gen_random_uuid());
   -- Inventory protection triggers reject quantities below existing holds.
   insert into public.product_variants(id,product_id,name,price_adjustment,pack_quantity,stock_quantity,active,sort_order,track_inventory)
   values(v_variant_id,v_id,item->>'name',(item->>'priceAdjustment')::integer,(item->>'packQuantity')::integer,(item->>'stockQuantity')::integer,(item->>'active')::boolean,(item->>'sortOrder')::integer,(item->>'trackInventory')::boolean)
   on conflict(id) do update set name=excluded.name,price_adjustment=excluded.price_adjustment,pack_quantity=excluded.pack_quantity,stock_quantity=excluded.stock_quantity,active=excluded.active,sort_order=excluded.sort_order,track_inventory=excluded.track_inventory,updated_at=now();
 end loop;
 for item in select value from jsonb_array_elements(p_images) loop
   update public.product_images set alt_text=item->>'altText',sort_order=(item->>'sortOrder')::integer where id=(item->>'id')::uuid and product_id=v_id;
 end loop;
 delete from public.product_images where product_id=v_id and id not in(select (i->>'id')::uuid from jsonb_array_elements(p_images) i);
 update public.products set status=v_product.status,updated_at=now() where id=v_id;
 select to_jsonb(p)||jsonb_build_object('product_variants',coalesce((select jsonb_agg(to_jsonb(v) order by v.sort_order,v.id) from public.product_variants v where v.product_id=p.id),'[]'::jsonb)) into v_after from public.products p where p.id=v_id;
 perform public.record_admin_audit(p_admin_id,p_session_id,case when p_id is null then 'PRODUCT_CREATED' else 'PRODUCT_UPDATED' end,'product',v_id::text,v_before,v_after);
 return v_id;
end $$;
revoke all on function public.admin_save_product(uuid,jsonb,jsonb,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_save_product(uuid,jsonb,jsonb,jsonb,uuid,uuid) to service_role;

-- Product duplication uses the same transaction and preserves per-pack policy.
create or replace function public.admin_duplicate_product(p_source_id uuid,p_admin_id uuid,p_session_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare p public.products; v_id uuid; v_variants jsonb; v_suffix text:=replace(gen_random_uuid()::text,'-','');
begin
 select * into p from public.products where id=p_source_id for update;
 if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'name',v.name,'priceAdjustment',v.price_adjustment,'packQuantity',v.pack_quantity,'stockQuantity',v.stock_quantity,'active',v.active,'sortOrder',v.sort_order,'trackInventory',v.track_inventory) order by v.sort_order,v.id),'[]'::jsonb)
 into v_variants from public.product_variants v where v.product_id=p_source_id and v.retired_at is null;
 v_id:=public.admin_save_product(null,to_jsonb(p)||jsonb_build_object('name',left(p.name,142)||' (Copy)','slug',left(p.slug,140)||'-copy-'||v_suffix,'status','DRAFT','featured',false),v_variants,'[]'::jsonb,p_admin_id,p_session_id);
 insert into public.product_images(product_id,url,alt_text,sort_order,storage_path) select v_id,url,alt_text,sort_order,storage_path from public.product_images where product_id=p_source_id;
 perform public.record_admin_audit(p_admin_id,p_session_id,'PRODUCT_DUPLICATED','product',v_id::text,null,null,jsonb_build_object('sourceProductId',p_source_id));
 return v_id;
end $$;
revoke all on function public.admin_duplicate_product(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_duplicate_product(uuid,uuid,uuid) to service_role;

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
  end loop;

  for item in
    select oi.product_id, oi.variant_id, sum(oi.quantity)::integer as quantity
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id and oi.product_id is not null
    group by oi.product_id, oi.variant_id order by oi.product_id, oi.variant_id
  loop
    if item.variant_id is null then
      raise exception using errcode = 'P0001', message = 'VARIANT_UNAVAILABLE';
    end if;
    select stock_quantity, active, coalesce(track_inventory,(select p.track_inventory from public.products p where p.id=item.product_id)) into v_stock, v_active, v_tracked
    from public.product_variants
    where id = item.variant_id and product_id = item.product_id and retired_at is null for update;
    if not found or not v_active then
      raise exception using errcode = 'P0001', message = 'VARIANT_UNAVAILABLE';
    end if;
    if exists(select 1 from public.order_items oi join public.products p on p.id=oi.product_id join public.product_variants v on v.id=oi.variant_id
      where oi.order_id=p_order_id and oi.variant_id=item.variant_id and (
       oi.unit_price<>coalesce(p.discount_price,p.base_price)+v.price_adjustment or
       (oi.product_snapshot ? 'packQuantity' and (oi.product_snapshot->>'packQuantity')::integer is distinct from v.pack_quantity) or
       (p.shopping_mode='MADE_TO_ORDER' and (v.pack_quantity is null or oi.unit_price<=0)) or
       (oi.product_snapshot ? 'inventoryTracked' and (oi.product_snapshot->>'inventoryTracked')::boolean<>v_tracked))) then raise exception 'PACK_CHANGED'; end if;
    if not v_tracked then continue; end if;
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
  join public.product_variants v on v.id=oi.variant_id
  where oi.order_id = p_order_id and coalesce(v.track_inventory,p.track_inventory)
  on conflict (order_item_id) do update set
    quantity = excluded.quantity, status = 'ACTIVE', expires_at = excluded.expires_at,
    committed_at = null, released_at = null, updated_at = now();
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
    join public.product_variants v on v.id=oi.variant_id
    where oi.order_id = v_order_id and coalesce((oi.product_snapshot->>'inventoryTracked')::boolean,v.track_inventory,p.track_inventory);
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
      when not exists (
        select 1 from public.product_variants pv
        where pv.product_id = p.id and pv.active = true and pv.retired_at is null and (p.shopping_mode<>'MADE_TO_ORDER' or (pv.pack_quantity>0 and coalesce(p.discount_price,p.base_price)::bigint+pv.price_adjustment>0)) and (not coalesce(pv.track_inventory,p.track_inventory) or pv.stock_quantity > 0)
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
      when p.status = 'OUT_OF_STOCK' and exists (
        select 1 from public.product_variants pv
        where pv.product_id = p.id and pv.active = true and pv.retired_at is null and (p.shopping_mode<>'MADE_TO_ORDER' or (pv.pack_quantity>0 and coalesce(p.discount_price,p.base_price)::bigint+pv.price_adjustment>0)) and (not coalesce(pv.track_inventory,p.track_inventory) or pv.stock_quantity > 0)
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


create or replace function public.admin_inventory_page(p_filters jsonb default '{}')
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_size integer:=coalesce((p_filters->>'size')::integer,25); v_page integer:=coalesce((p_filters->>'page')::integer,1); v_result jsonb;
begin
 if v_size not in (25,50,100) or v_page<1 or v_page>1000000 then raise exception 'Invalid inventory query'; end if;
 with base as materialized (
   select p.id,p.name,p.stock_quantity,exists(select 1 from public.product_variants v where v.product_id=p.id and v.active and coalesce(v.track_inventory,p.track_inventory)) as track_inventory,p.status,
     exists(select 1 from public.product_variants v where v.product_id=p.id and v.active and coalesce(v.track_inventory,p.track_inventory)) and p.status not in ('DRAFT','ARCHIVED') as tracked,
     exists(select 1 from public.product_variants v where v.product_id=p.id and v.active and coalesce(v.track_inventory,p.track_inventory) and v.stock_quantity=0) as is_out,
     exists(select 1 from public.product_variants v where v.product_id=p.id and v.active and coalesce(v.track_inventory,p.track_inventory) and v.stock_quantity>0 and v.stock_quantity<=p.low_stock_threshold) as is_low,
     strpos(lower(p.name||' '||coalesce(p.sku,'')||' '||coalesce(c.name,'')),lower(coalesce(p_filters->>'q','')))>0
       or exists(select 1 from public.product_variants v where v.product_id=p.id and strpos(lower(v.name||' '||coalesce(v.sku,'')),lower(p_filters->>'q'))>0) as matches
   from public.products p left join public.categories c on c.id=p.category_id
 ), categorized as materialized (
   select b.*,array_remove(array[
     case when tracked then 'ALL' end, case when tracked and (is_low or is_out) then 'ATTENTION' end,
     case when tracked and is_low then 'LOW' end, case when tracked and is_out then 'OUT' end,
     case when not track_inventory then 'UNTRACKED' end,case when status in ('DRAFT','ARCHIVED') then 'INACTIVE' end
   ],null) as categories from base b
 ), filtered as materialized (select * from categorized where matches and coalesce(p_filters->>'category','ALL')=any(categories)),
 paged as (select * from filtered order by
   case when p_filters->>'sort'='quantity' then stock_quantity end asc,
   name asc,id asc limit v_size offset (v_page-1)*v_size),
 counts as (select category,count(*) as n from categorized,unnest(categories) category group by category)
 select jsonb_build_object('ids',coalesce((select jsonb_agg(id order by case when p_filters->>'sort'='quantity' then stock_quantity end asc,name,id) from paged),'[]'::jsonb),
   'total',(select count(*) from filtered),'counts',coalesce((select jsonb_object_agg(category,n) from counts),'{}'::jsonb),'page',v_page,'size',v_size) into v_result;
 return v_result;
end; $$;
revoke all on function public.admin_inventory_page(jsonb) from public,anon,authenticated;
grant execute on function public.admin_inventory_page(jsonb) to service_role;

-- Dashboard stock alerts use the same per-pack tracking policy.
create or replace function public.admin_dashboard_summary(p_now timestamptz default now()) returns jsonb
language sql stable security invoker set search_path='' as $$
with paid as materialized (
 select o.id, lower(trim(o.email)) email,
 coalesce(p.paid_at,o.created_at) paid_at,
 case when p.id is not null then p.amount else o.grand_total end gross,
 coalesce(p.refunded_amount,case when o.status='REFUNDED' then o.grand_total else 0 end) refunds
 from public.orders o left join lateral (
   select p.id,p.amount,p.refunded_amount,p.paid_at,p.created_at,p.status from public.payments p where p.order_id=o.id
   order by coalesce(p.paid_at,p.created_at) desc,p.id desc limit 1
 ) p on true
 where case when p.id is not null then p.status::text in ('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED')
   else o.status::text in ('PAID','CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED','REFUNDED') end
), totals as (
 select greatest(0,coalesce(sum(gross-refunds) filter(where paid_at>=p_now-interval '30 days' and paid_at<p_now),0)) revenue,
 coalesce(sum(greatest(0,gross-refunds)) filter(where paid_at>=p_now-interval '60 days' and paid_at<p_now-interval '30 days'),0) previous,
 count(*) filter(where paid_at>=p_now-interval '30 days' and paid_at<p_now) paid_orders
 from paid
), customers as (
 select email, count(*) filter(where paid_at>=p_now-interval '30 days' and paid_at<p_now) current_orders,
 bool_or(paid_at<p_now-interval '30 days') prior from paid group by email
), returning_stats as (
 select count(*) filter(where current_orders>0) customers,
 count(*) filter(where current_orders>0 and (prior or current_orders>1)) returned from customers
), stock as (
 select count(*) low from public.products p where p.status='ACTIVE' and exists (
   select 1 from public.product_variants v where v.product_id=p.id and v.active and v.retired_at is null and coalesce(v.track_inventory,p.track_inventory) and v.stock_quantity<=p.low_stock_threshold
 )
), recent as (
 select o.id,o.order_number,o.customer_name,o.created_at,o.grand_total,o.status,o.fulfilment
 from public.orders o order by o.created_at desc,o.id desc limit 5
)
select jsonb_build_object(
 'netRevenue',t.revenue,'paidOrders',t.paid_orders,
 'averageOrderValue',case when t.paid_orders>0 then round(t.revenue::numeric/t.paid_orders) else 0 end,
 'revenueChange',case when t.previous>0 then (t.revenue-t.previous)*100.0/t.previous when t.revenue=0 then 0 else null end,
 'returningCustomers',r.returned,'repeatCustomerRate',case when r.customers>0 then r.returned*100.0/r.customers else 0 end,
 'lowStockProducts',s.low,
 'waitingQuotes',(select count(*) from public.custom_cake_orders where status in ('DRAFT','QUOTE_REQUIRED')),
 'recentOrders',coalesce((select jsonb_agg(jsonb_build_object('id',o.order_number,'customer',o.customer_name,'date',o.created_at,'total',o.grand_total,'status',o.status,'fulfilment',o.fulfilment,
   'items',(select coalesce(sum(i.quantity),0) from public.order_items i where i.order_id=o.id)) order by o.created_at desc,o.id desc) from recent o),'[]'::jsonb)
) from totals t cross join returning_stats r cross join stock s;
$$;
revoke all on function public.admin_dashboard_summary(timestamptz) from public,anon,authenticated;
grant execute on function public.admin_dashboard_summary(timestamptz) to service_role;

-- Customer/checkout availability subtracts active holds; admin stock remains
-- the physical quantity for compare-and-set edits. Returns one object to avoid
-- PostgREST row caps truncating reservations.
create function public.product_pack_availability(p_ids uuid[]) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_object_agg(v.id,greatest(0,v.stock_quantity-coalesce(r.held,0))),'{}'::jsonb)
 from public.product_variants v left join lateral (
   select sum(quantity)::integer as held from public.inventory_reservations r
   where r.variant_id=v.id and r.status='ACTIVE' and r.expires_at>now()
 ) r on true where v.product_id=any(p_ids);
$$;
revoke all on function public.product_pack_availability(uuid[]) from public,anon,authenticated;
grant execute on function public.product_pack_availability(uuid[]) to service_role;

-- Validate the final transaction state, including status changes made outside
-- the editor. Deferred checks permit safe pack reordering and size swaps.
create function public.guard_published_product_packs() returns trigger
language plpgsql set search_path='' as $$
declare p public.products; v_id uuid;
begin
 -- Existing paid/reserved legacy lines must still fulfil/refund even if their
 -- old packs need owner configuration. Stock-only maintenance is not publishing.
 if tg_op='UPDATE' then
   if tg_table_name='products' then
     if old.status is not distinct from new.status and old.shopping_mode is not distinct from new.shopping_mode and old.base_price is not distinct from new.base_price and old.discount_price is not distinct from new.discount_price then return null; end if;
   else
     if old.active is not distinct from new.active and old.pack_quantity is not distinct from new.pack_quantity and old.price_adjustment is not distinct from new.price_adjustment and old.retired_at is not distinct from new.retired_at then return null; end if;
   end if;
 end if;
 if tg_table_name='products' then v_id:=new.id; else v_id:=coalesce(new.product_id,old.product_id); end if;
 select * into p from public.products where id=v_id;
 if p.shopping_mode<>'MADE_TO_ORDER' or p.status<>'ACTIVE' then return null; end if;
 if not exists(select 1 from public.product_variants v where v.product_id=v_id and v.active and v.retired_at is null and v.pack_quantity>0 and coalesce(p.discount_price,p.base_price)::bigint+v.price_adjustment>0)
   or exists(select 1 from public.product_variants v where v.product_id=v_id and v.active and (v.retired_at is not null or v.pack_quantity is null or coalesce(p.discount_price,p.base_price)::bigint+v.price_adjustment<=0)) then raise exception 'COMPLETE_PUBLISHED_PACKS'; end if;
 if exists(select 1 from public.product_variants v where v.product_id=v_id and v.active group by v.pack_quantity having count(*)>1) then raise exception 'DUPLICATE_ACTIVE_PACK_SIZE'; end if;
 return null;
end $$;
create constraint trigger guard_product_packs after insert or update on public.products deferrable initially deferred
for each row execute function public.guard_published_product_packs();
create constraint trigger guard_variant_packs after insert or update or delete on public.product_variants deferrable initially deferred
for each row execute function public.guard_published_product_packs();
revoke all on function public.guard_published_product_packs() from public,anon,authenticated;
commit;

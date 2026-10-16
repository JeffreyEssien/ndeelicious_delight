-- Per-size layer counts for cakes, plus an Orders product-type filter.
-- cake_layers: { "<variantId>": <layerCount> } on products (drives how many flavour/filling
-- pickers the customer sees once they choose a size). Flavour/filling choices stay in option_groups.

alter table public.products
  add column if not exists cake_layers jsonb not null default '{}'::jsonb;

-- Redefine the save RPC to persist cake_layers (jsonb_populate_record lifts it off p_product;
-- we only add it to the INSERT/UPDATE column lists). Body copied from migration 0045.
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
   insert into public.products(id,category_id,name,slug,short_description,description,base_price,discount_price,status,featured,track_inventory,low_stock_threshold,ingredients,allergens,storage_instructions,preparation_instructions,shopping_mode,tax_class,preparation_hours,option_groups,cake_layers)
   values(v_id,v_product.category_id,v_product.name,v_product.slug,v_product.short_description,v_product.description,v_product.base_price,v_product.discount_price,'DRAFT',v_product.featured,v_product.track_inventory,v_product.low_stock_threshold,v_product.ingredients,v_product.allergens,v_product.storage_instructions,v_product.preparation_instructions,v_product.shopping_mode,v_product.tax_class,v_product.preparation_hours,coalesce(v_product.option_groups,'[]'::jsonb),coalesce(v_product.cake_layers,'{}'::jsonb));
 else
   update public.products set category_id=v_product.category_id,name=v_product.name,slug=v_product.slug,short_description=v_product.short_description,description=v_product.description,
   base_price=v_product.base_price,discount_price=v_product.discount_price,status='DRAFT',featured=v_product.featured,track_inventory=v_product.track_inventory,low_stock_threshold=v_product.low_stock_threshold,ingredients=v_product.ingredients,allergens=v_product.allergens,storage_instructions=v_product.storage_instructions,preparation_instructions=v_product.preparation_instructions,shopping_mode=v_product.shopping_mode,tax_class=v_product.tax_class,preparation_hours=v_product.preparation_hours,option_groups=coalesce(v_product.option_groups,'[]'::jsonb),cake_layers=coalesce(v_product.cake_layers,'{}'::jsonb),updated_at=now() where id=v_id;
 end if;
 update public.product_variants set active=false,retired_at=coalesce(retired_at,now()),updated_at=now() where product_id=v_id
   and id not in(select (v->>'id')::uuid from jsonb_array_elements(p_variants) v where v->>'id' is not null);
 for item in select value from jsonb_array_elements(p_variants) loop
   v_variant_id:=coalesce((item->>'id')::uuid,gen_random_uuid());
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

-- Redefine the Orders/Cakes history page to accept an optional productType filter (category slug)
-- that narrows orders to those containing a line item in that product category. Body copied from
-- migration 0034 with one extra filter in the `filtered` CTE.
create or replace function public.admin_history_page(p_kind text, p_filters jsonb default '{}')
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_size integer := coalesce((p_filters->>'size')::integer,25);
  v_page integer := coalesce((p_filters->>'page')::integer,1);
  v_as_of timestamptz := coalesce((p_filters->>'asOf')::timestamptz,now());
  v_result jsonb;
  v_today date := (now() at time zone coalesce((select value->>'timezone' from public.site_settings where key='business'),'America/Halifax'))::date;
begin
  if p_kind not in ('orders','cakes') or v_size not in (25,50,100) or v_page < 1 or v_page > 1000000 then
    raise exception 'Invalid history query';
  end if;
  with base as materialized (
    select o.id, o.order_number as number, o.customer_name as customer, o.email, o.phone,
      o.status::text as status, o.created_at, o.grand_total as total, o.currency::text,
      o.fulfilment, coalesce(p.status::text,'UNPAID') as payment_status,
      (select min(c.requested_date) from public.custom_cake_orders c where c.order_id=o.id) as deadline,
      null::text as occasion
    from public.orders o
    left join lateral (select p.status from public.payments p where p.order_id=o.id
      order by p.created_at desc, p.id desc limit 1) p on true
    where p_kind='orders' and o.created_at<=v_as_of
    union all
    select c.id,c.request_number,c.customer_name,c.email,c.phone,c.status::text,c.created_at,
      coalesce(c.quoted_total,c.estimated_total),null::text,null::text,null::text,
      c.requested_date,c.configuration->>'occasion'
    from public.custom_cake_orders c where p_kind='cakes' and c.created_at<=v_as_of
  ), categorized as materialized (
    select b.*, array_remove(array[
      'ALL',
      case when p_kind='orders' and status not in ('CANCELLED','REFUNDED','DELIVERED') and (status='FAILED' or payment_status='FAILED') then 'ATTENTION'
        when p_kind='cakes' and (status in ('DRAFT','QUOTE_REQUIRED') or
          (deadline<v_today and status not in ('DELIVERED','CANCELLED','REFUNDED'))) then 'ATTENTION' end,
      case when p_kind='orders' and status='PENDING_PAYMENT' then 'AWAITING_PAYMENT' end,
      case when status in ('PAID','CONFIRMED','CUSTOMER_APPROVED') then 'TO_PREPARE' end,
      case when status='PREPARING' then 'PREPARING' end,
      case when status='READY' then 'READY' end,
      case when status='OUT_FOR_DELIVERY' or (p_kind='orders' and status='READY' and fulfilment='pickup') then 'OUT' end,
      case when status='DELIVERED' then 'COMPLETED' end,
      case when status='CANCELLED' then 'CANCELLED' end,
      case when p_kind='cakes' and status in ('DRAFT','QUOTE_REQUIRED') then 'NEEDS_QUOTE' end,
      case when p_kind='cakes' and status='QUOTE_SENT' then 'QUOTE_SENT' end,
      case when p_kind='cakes' and status='QUOTE_SENT' then 'AWAITING_APPROVAL' end
    ],null) as categories from base b
  ), filtered as materialized (
    select * from categorized b where
      (coalesce(p_filters->>'category','ALL')=any(b.categories))
      and (coalesce(p_filters->>'q','')='' or strpos(lower(b.number||' '||b.customer||' '||b.email||' '||b.phone),lower(p_filters->>'q'))>0)
      and (coalesce(p_filters->>'stage','')='' or b.status=p_filters->>'stage')
      and (coalesce(p_filters->>'payment','')='' or b.payment_status=p_filters->>'payment')
      and (coalesce(p_filters->>'fulfilment','')='' or b.fulfilment=p_filters->>'fulfilment')
      and (coalesce(p_filters->>'from','')='' or b.created_at >= (p_filters->>'from')::date)
      and (coalesce(p_filters->>'to','')='' or b.created_at < (p_filters->>'to')::date+interval '1 day')
      and (coalesce(p_filters->>'productType','')='' or p_kind<>'orders' or exists(
        select 1 from public.order_items oi
        join public.products pr on pr.id=oi.product_id
        join public.categories cat on cat.id=pr.category_id
        where oi.order_id=b.id and cat.slug=p_filters->>'productType'))
  ), numbered as (
    select f.*, row_number() over (order by
      case when p_filters->>'sort'='oldest' then created_at end asc,
      case when p_filters->>'sort'='total-asc' then total end asc nulls last,
      case when p_filters->>'sort'='total-desc' then total end desc nulls last,
      case when p_filters->>'sort'='deadline' then deadline end asc nulls last,
      case when coalesce(p_filters->>'sort','newest')='newest' then created_at end desc,
      id desc) as position from filtered f
  ), paged as (
    select * from numbered order by position limit v_size offset (v_page-1)*v_size
  ), category_counts as (
    select category, count(*) as count from categorized, unnest(categories) category group by category
  )
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'number',r.number,'customer',r.customer,'status',r.status,'createdAt',r.created_at,
      'total',r.total,'currency',r.currency,'fulfilment',r.fulfilment,'paymentStatus',r.payment_status,
      'deadline',r.deadline,'occasion',r.occasion,
      'referencePath',case when p_kind='cakes' then (select c.reference_urls[1] from public.custom_cake_orders c where c.id=r.id) end,
      'items',case when p_kind='orders' then (select coalesce(sum(i.quantity),0) from public.order_items i where i.order_id=r.id) end
    ) order by position) from paged r),'[]'::jsonb),
    'total',(select count(*) from filtered),
    'counts',coalesce((select jsonb_object_agg(category,count) from category_counts),'{}'::jsonb),
    'page',v_page,'size',v_size,'asOf',v_as_of
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.admin_history_page(text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_history_page(text,jsonb) to service_role;

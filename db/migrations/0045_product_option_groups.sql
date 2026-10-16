-- Cakes as products: per-product customisation option groups (e.g. per-layer flavour/filling).
-- Stored as jsonb on products: [{ id, name, choices: text[], required }]. Customer selections are
-- captured on order_items.product_snapshot (no schema change needed there).

alter table public.products
  add column if not exists option_groups jsonb not null default '[]'::jsonb;

-- Redefine the save RPC so option_groups is persisted alongside the rest of the product.
-- jsonb_populate_record already lifts option_groups off p_product into v_product once the column
-- exists; we only add it to the INSERT/UPDATE column lists.
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
   insert into public.products(id,category_id,name,slug,short_description,description,base_price,discount_price,status,featured,track_inventory,low_stock_threshold,ingredients,allergens,storage_instructions,preparation_instructions,shopping_mode,tax_class,preparation_hours,option_groups)
   values(v_id,v_product.category_id,v_product.name,v_product.slug,v_product.short_description,v_product.description,v_product.base_price,v_product.discount_price,'DRAFT',v_product.featured,v_product.track_inventory,v_product.low_stock_threshold,v_product.ingredients,v_product.allergens,v_product.storage_instructions,v_product.preparation_instructions,v_product.shopping_mode,v_product.tax_class,v_product.preparation_hours,coalesce(v_product.option_groups,'[]'::jsonb));
 else
   -- DRAFT is transaction-local while variants and prices are replaced together.
   update public.products set category_id=v_product.category_id,name=v_product.name,slug=v_product.slug,short_description=v_product.short_description,description=v_product.description,
   base_price=v_product.base_price,discount_price=v_product.discount_price,status='DRAFT',featured=v_product.featured,track_inventory=v_product.track_inventory,low_stock_threshold=v_product.low_stock_threshold,ingredients=v_product.ingredients,allergens=v_product.allergens,storage_instructions=v_product.storage_instructions,preparation_instructions=v_product.preparation_instructions,shopping_mode=v_product.shopping_mode,tax_class=v_product.tax_class,preparation_hours=v_product.preparation_hours,option_groups=coalesce(v_product.option_groups,'[]'::jsonb),updated_at=now() where id=v_id;
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

-- Deleting a product or a delivery area removes it for good.
-- Orders keep their own copies of what was bought and delivered (order_items carries the
-- product name, variant, SKU and prices; orders carry the address, fees and fulfilment
-- snapshot), so their links to a deleted row are cleared instead of blocking the delete.
-- Things that only exist for the product (variants, images, reviews, review invitations,
-- basket lines) go with it.
begin;

alter table public.order_items
  drop constraint order_items_product_id_fkey,
  add constraint order_items_product_id_fkey
    foreign key (product_id) references public.products(id) on delete set null,
  drop constraint order_items_variant_id_fkey,
  add constraint order_items_variant_id_fkey
    foreign key (variant_id) references public.product_variants(id) on delete set null;

alter table public.orders
  drop constraint orders_delivery_zone_id_fkey,
  add constraint orders_delivery_zone_id_fkey
    foreign key (delivery_zone_id) references public.delivery_zones(id) on delete set null;

-- Finished stock holds are history. Live ones block the delete in admin_delete_product.
alter table public.inventory_reservations
  alter column product_id drop not null,
  alter column variant_id drop not null,
  drop constraint inventory_reservations_product_id_fkey,
  add constraint inventory_reservations_product_id_fkey
    foreign key (product_id) references public.products(id) on delete set null,
  drop constraint inventory_reservations_variant_id_fkey,
  add constraint inventory_reservations_variant_id_fkey
    foreign key (variant_id) references public.product_variants(id) on delete set null;

alter table public.product_variants
  drop constraint product_variants_product_id_fkey,
  add constraint product_variants_product_id_fkey
    foreign key (product_id) references public.products(id) on delete cascade;

alter table public.cart_items
  drop constraint cart_items_product_id_fkey,
  add constraint cart_items_product_id_fkey
    foreign key (product_id) references public.products(id) on delete cascade,
  drop constraint cart_items_variant_id_fkey,
  add constraint cart_items_variant_id_fkey
    foreign key (variant_id) references public.product_variants(id) on delete cascade;

alter table public.reviews
  drop constraint reviews_product_id_fkey,
  add constraint reviews_product_id_fkey
    foreign key (product_id) references public.products(id) on delete cascade;

alter table public.review_invitations
  drop constraint review_invitations_product_id_fkey,
  add constraint review_invitations_product_id_fkey
    foreign key (product_id) references public.products(id) on delete cascade;

-- Deleting a product removes its variants; the pack check must not demand packs for a product
-- that no longer exists.
create or replace function public.guard_published_product_packs() returns trigger
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
 -- The product itself is being deleted, taking its packs with it.
 if p.id is null then return null; end if;
 if p.shopping_mode<>'MADE_TO_ORDER' or p.status<>'ACTIVE' then return null; end if;
 if not exists(select 1 from public.product_variants v where v.product_id=v_id and v.active and v.retired_at is null and v.pack_quantity>0 and coalesce(p.discount_price,p.base_price)::bigint+v.price_adjustment>0)
   or exists(select 1 from public.product_variants v where v.product_id=v_id and v.active and (v.retired_at is not null or v.pack_quantity is null or coalesce(p.discount_price,p.base_price)::bigint+v.price_adjustment<=0)) then raise exception 'COMPLETE_PUBLISHED_PACKS'; end if;
 if exists(select 1 from public.product_variants v where v.product_id=v_id and v.active group by v.pack_quantity having count(*)>1) then raise exception 'DUPLICATE_ACTIVE_PACK_SIZE'; end if;
 return null;
end $$;

create or replace function public.admin_delete_product(p_id uuid, p_admin_id uuid, p_session_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_before jsonb;
begin
  select to_jsonb(p) into v_before from public.products p where p.id = p_id for update;
  if v_before is null then
    raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND';
  end if;
  -- Stock is held for a checkout that is still being paid; deleting now would strand it.
  if exists (
    select 1 from public.inventory_reservations r
    where r.product_id = p_id and r.status = 'ACTIVE' and r.expires_at > now()
  ) then
    raise exception using errcode = 'P0001', message = 'PRODUCT_IN_CHECKOUT';
  end if;
  update public.coupons set product_ids = array_remove(product_ids, p_id), updated_at = now()
  where p_id = any(product_ids);
  delete from public.products where id = p_id;
  perform public.record_admin_audit(p_admin_id, p_session_id, 'PRODUCT_DELETED', 'product', p_id::text, v_before, null);
end $$;
revoke all on function public.admin_delete_product(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_product(uuid, uuid, uuid) to service_role;

-- Areas left out of the saved list are deleted rather than switched off.
create or replace function public.save_delivery_areas(p_areas jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare item jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('ndee-delivery-prefixes'));
 delete from public.delivery_zones
 where id <> all(array(select (value->>'id')::uuid from jsonb_array_elements(p_areas)));
 update public.delivery_zones set active=false where active;
 for item in select value from jsonb_array_elements(p_areas) loop
 insert into public.delivery_zones(id,name,fee,minimum_order,estimated_time,active,sort_order,postal_code_prefixes,free_delivery_threshold,customer_note,same_day_eligible)
 values((item->>'id')::uuid,item->>'name',(item->>'fee')::integer,(item->>'minimumOrder')::integer,item->>'estimate',(item->>'active')::boolean,(item->>'sortOrder')::integer,array(select jsonb_array_elements_text(item->'postalCodePrefixes')),(item->>'freeDeliveryThreshold')::integer,item->>'customerNote',(item->>'sameDayEligible')::boolean)
 on conflict(id) do update set name=excluded.name,fee=excluded.fee,minimum_order=excluded.minimum_order,estimated_time=excluded.estimated_time,active=excluded.active,sort_order=excluded.sort_order,postal_code_prefixes=excluded.postal_code_prefixes,free_delivery_threshold=excluded.free_delivery_threshold,customer_note=excluded.customer_note,same_day_eligible=excluded.same_day_eligible,updated_at=now();
 end loop;
end $$;
revoke all on function public.save_delivery_areas(jsonb) from public,anon,authenticated;
grant execute on function public.save_delivery_areas(jsonb) to service_role;
commit;

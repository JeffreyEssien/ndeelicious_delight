begin;
-- No owner content updates and no invented commercial configuration.
alter table public.delivery_zones add column postal_code_prefixes text[] not null default '{}', add column free_delivery_threshold integer check (free_delivery_threshold >= 0), add column customer_note text not null default '', add column same_day_eligible boolean not null default false;
alter table public.cake_types add column base_price integer check (base_price >= 0), add column tax_class text not null default 'REQUIRES_REVIEW' check (tax_class in ('FULL_CAKE','WEDDING_CAKE','STANDARD_TAXABLE','REQUIRES_REVIEW'));
alter table public.product_variants add column pack_quantity integer check (pack_quantity > 0);
alter table public.products add column tax_class text not null default 'REQUIRES_REVIEW' check (tax_class in ('ZERO_RATED_GROCERY','SWEET_SINGLE_SERVING','FULL_CAKE','WEDDING_CAKE','STANDARD_TAXABLE','REQUIRES_REVIEW'));
alter table public.orders add column tax_snapshot jsonb, add column fulfilment_snapshot jsonb;
create table public.cake_type_options (cake_type_id uuid not null references public.cake_types(id) on delete cascade, option_id uuid not null references public.custom_cake_options(id) on delete cascade, primary key (cake_type_id,option_id));
alter table public.cake_type_options enable row level security;
create policy cake_type_options_public_read on public.cake_type_options for select using (exists(select 1 from public.cake_types t where t.id=cake_type_id and t.active) and exists(select 1 from public.custom_cake_options o where o.id=option_id and o.active));
grant select on public.cake_type_options to anon,authenticated;
grant all on public.cake_type_options to service_role;
create function public.validate_delivery_prefixes() returns trigger language plpgsql set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtext('ndee-delivery-prefixes'));
 if exists(select 1 from unnest(new.postal_code_prefixes) p where p !~ '^B[0-9][ABCEGHJ-NPRSTVWXYZ]$') then raise exception 'Invalid Nova Scotia postal prefix'; end if;
 if cardinality(new.postal_code_prefixes) <> (select count(distinct p) from unnest(new.postal_code_prefixes) p) then raise exception 'Duplicate postal prefix'; end if;
 if new.active and exists(select 1 from public.delivery_zones z where z.id<>new.id and z.active and z.postal_code_prefixes && new.postal_code_prefixes) then raise exception 'Overlapping active postal prefixes'; end if;
 return new;
end $$;
create trigger delivery_prefixes_unique before insert or update on public.delivery_zones for each row execute function public.validate_delivery_prefixes();
create function public.save_delivery_areas(p_areas jsonb) returns void language plpgsql security definer set search_path=public as $$
declare item jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('ndee-delivery-prefixes'));
 update public.delivery_zones set active=false;
 for item in select value from jsonb_array_elements(p_areas) loop
 insert into public.delivery_zones(id,name,fee,minimum_order,estimated_time,active,sort_order,postal_code_prefixes,free_delivery_threshold,customer_note,same_day_eligible)
 values((item->>'id')::uuid,item->>'name',(item->>'fee')::integer,(item->>'minimumOrder')::integer,item->>'estimate',(item->>'active')::boolean,(item->>'sortOrder')::integer,array(select jsonb_array_elements_text(item->'postalCodePrefixes')),(item->>'freeDeliveryThreshold')::integer,item->>'customerNote',(item->>'sameDayEligible')::boolean)
 on conflict(id) do update set name=excluded.name,fee=excluded.fee,minimum_order=excluded.minimum_order,estimated_time=excluded.estimated_time,active=excluded.active,sort_order=excluded.sort_order,postal_code_prefixes=excluded.postal_code_prefixes,free_delivery_threshold=excluded.free_delivery_threshold,customer_note=excluded.customer_note,same_day_eligible=excluded.same_day_eligible,updated_at=now();
 end loop;
end $$;
revoke all on function public.save_delivery_areas(jsonb) from public,anon,authenticated;
grant execute on function public.save_delivery_areas(jsonb) to service_role;
create function public.save_cake_option_assignments(p_cake_type_id uuid,p_option_ids uuid[]) returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from public.cake_types where id=p_cake_type_id for update;
 if not found then raise exception 'Cake type unavailable'; end if;
 delete from public.cake_type_options where cake_type_id=p_cake_type_id;
 insert into public.cake_type_options(cake_type_id,option_id) select p_cake_type_id,unnest(p_option_ids);
end $$;
revoke all on function public.save_cake_option_assignments(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.save_cake_option_assignments(uuid,uuid[]) to service_role;
create function public.save_cake_configuration(p_types jsonb,p_assignments jsonb) returns void language plpgsql security definer set search_path=public as $$
declare item jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('ndee-cake-configuration'));
 for item in select value from jsonb_array_elements(p_types) loop
 insert into public.cake_types(id,name,slug,description,base_price,tax_class,lead_time_value,lead_time_unit,active,sort_order,image,customer_notice)
 values((item->>'id')::uuid,item->>'name',item->>'slug',item->>'description',(item->>'basePrice')::integer,item->>'taxClass',(item->>'leadTimeValue')::numeric,item->>'leadTimeUnit',(item->>'active')::boolean,(item->>'sortOrder')::integer,item->>'image',item->>'customerNotice')
 on conflict(id) do update set name=excluded.name,slug=excluded.slug,description=excluded.description,base_price=excluded.base_price,tax_class=excluded.tax_class,lead_time_value=excluded.lead_time_value,lead_time_unit=excluded.lead_time_unit,active=excluded.active,sort_order=excluded.sort_order,image=excluded.image,customer_notice=excluded.customer_notice;
 end loop;
 if p_assignments is not null then
   delete from public.cake_type_options where cake_type_id in (select (value->>'id')::uuid from jsonb_array_elements(p_types));
   insert into public.cake_type_options(cake_type_id,option_id) select (value->>'cakeTypeId')::uuid,(value->>'optionId')::uuid from jsonb_array_elements(p_assignments);
 end if;
end $$;
revoke all on function public.save_cake_configuration(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_cake_configuration(jsonb,jsonb) to service_role;
create function public.guard_commerce_snapshots() returns trigger language plpgsql set search_path=public as $$
declare zone public.delivery_zones; fsa text; expected_fee integer;
begin
 if tg_op='UPDATE' then
   if old.tax_snapshot is not null and (old.tax_snapshot is distinct from new.tax_snapshot or old.fulfilment_snapshot is distinct from new.fulfilment_snapshot or old.subtotal is distinct from new.subtotal or old.discount_total is distinct from new.discount_total or old.delivery_fee is distinct from new.delivery_fee or old.tax_total is distinct from new.tax_total or old.grand_total is distinct from new.grand_total) then raise exception 'Commerce snapshots are immutable'; end if;
   return new;
 end if;
 if new.tax_snapshot is null then return new; end if;
 if new.fulfilment='delivery' then
   perform pg_advisory_xact_lock(hashtext('ndee-delivery-prefixes'));
   select * into zone from public.delivery_zones where id=new.delivery_zone_id and active;
   fsa := upper(left(replace(new.delivery_address_snapshot->>'postalCode',' ',''),3));
   if zone.id is null or not coalesce(fsa=any(zone.postal_code_prefixes),false) or new.delivery_address_snapshot->>'country' is distinct from 'CA' or new.delivery_address_snapshot->>'province' is distinct from 'NS' then raise exception 'Delivery area no longer matches the postal address'; end if;
   expected_fee := case when zone.free_delivery_threshold is not null and new.subtotal>=zone.free_delivery_threshold then 0 else zone.fee end;
   if new.subtotal<zone.minimum_order or new.delivery_fee<>expected_fee then raise exception 'Delivery pricing changed. Request a new quote'; end if;
 end if;
 if new.tax_snapshot->>'jurisdiction' is distinct from 'CA-NS' or new.tax_total is distinct from (new.tax_snapshot->>'total')::integer or new.grand_total<>new.subtotal-new.discount_total+new.delivery_fee+new.tax_total then raise exception 'Invalid commerce totals snapshot'; end if;
 return new;
end $$;
create trigger commerce_snapshot_guard before insert or update on public.orders for each row execute function public.guard_commerce_snapshots();
commit;

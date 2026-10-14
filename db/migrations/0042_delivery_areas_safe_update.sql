-- Fix: save_delivery_areas deactivated every zone with a WHERE-less UPDATE, which the
-- database rejects when sql_safe_updates is enabled (SQLSTATE 21000). Saving delivery
-- areas from the admin therefore always failed with a 500. Scope the reset to active rows.
begin;
create or replace function public.save_delivery_areas(p_areas jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare item jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('ndee-delivery-prefixes'));
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

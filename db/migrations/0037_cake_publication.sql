-- Preserve historical options; validate published cakes after assignments have
-- been saved, inside the same transaction. Drafts may remain incomplete.
create or replace function public.validate_published_cakes(p_ids uuid[] default null) returns void
language plpgsql security invoker set search_path='' as $$
declare v_missing text;
begin
 select t.name into v_missing from public.cake_types t where t.active and (p_ids is null or t.id=any(p_ids)) and (
   t.base_price is null or t.lead_time_value<=0 or t.tax_class='REQUIRES_REVIEW'
   or exists(select 1 from unnest(array['occasion','size','flavour','filling','design']) required(type)
     where not exists(select 1 from public.cake_type_options link join public.custom_cake_options o on o.id=link.option_id
       where link.cake_type_id=t.id and o.active and o.type=required.type))
 ) limit 1;
 if v_missing is not null then raise exception 'Complete price, tax, preparation time and available choices before publishing %',v_missing; end if;
end; $$;
create or replace function public.save_cake_configuration(p_types jsonb,p_assignments jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare item jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('ndee-cake-configuration'));
 for item in select value from jsonb_array_elements(p_types) loop
 insert into public.cake_types(id,name,slug,description,base_price,tax_class,lead_time_value,lead_time_unit,active,sort_order,image,customer_notice)
 values((item->>'id')::uuid,item->>'name',item->>'slug',item->>'description',(item->>'basePrice')::integer,item->>'taxClass',(item->>'leadTimeValue')::numeric,item->>'leadTimeUnit',(item->>'active')::boolean,(item->>'sortOrder')::integer,item->>'image',item->>'customerNotice')
 on conflict(id) do update set name=excluded.name,slug=excluded.slug,description=excluded.description,base_price=excluded.base_price,tax_class=excluded.tax_class,lead_time_value=excluded.lead_time_value,lead_time_unit=excluded.lead_time_unit,active=excluded.active,sort_order=excluded.sort_order,image=excluded.image,customer_notice=excluded.customer_notice;
 end loop;
 if p_assignments is not null then
   if exists(select 1 from jsonb_array_elements(p_assignments) a where not exists(select 1 from jsonb_array_elements(p_types) t where t->>'id'=a->>'cakeTypeId')) then raise exception 'Assignments must belong to submitted cakes'; end if;
   delete from public.cake_type_options where cake_type_id in (select (value->>'id')::uuid from jsonb_array_elements(p_types));
   insert into public.cake_type_options(cake_type_id,option_id) select (value->>'cakeTypeId')::uuid,(value->>'optionId')::uuid from jsonb_array_elements(p_assignments);
 end if;
 perform public.validate_published_cakes(array(select (value->>'id')::uuid from jsonb_array_elements(p_types)));
end $$;
create or replace function public.admin_save_cake_options(p_options jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare item jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('ndee-cake-configuration'));
 update public.custom_cake_options set active=false where id not in (select (value->>'id')::uuid from jsonb_array_elements(p_options));
 for item in select value from jsonb_array_elements(p_options) loop
   insert into public.custom_cake_options(id,type,name,description,price_adjustment,quote_required,active,sort_order)
   values((item->>'id')::uuid,item->>'type',item->>'name',nullif(item->>'description',''),(item->>'priceAdjustment')::integer,(item->>'quoteRequired')::boolean,(item->>'active')::boolean,(item->>'sortOrder')::integer)
   on conflict(id) do update set name=excluded.name,description=excluded.description,price_adjustment=excluded.price_adjustment,quote_required=excluded.quote_required,active=excluded.active,sort_order=excluded.sort_order;
 end loop;
 perform public.validate_published_cakes();
end $$;
revoke all on function public.validate_published_cakes(uuid[]) from public,anon,authenticated;
revoke all on function public.admin_save_cake_options(jsonb) from public,anon,authenticated;
grant execute on function public.admin_save_cake_options(jsonb) to service_role;
grant execute on function public.validate_published_cakes(uuid[]) to service_role;

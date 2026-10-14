-- Only size and flavour are mandatory to publish a cake. Occasion, filling and design
-- are optional extras, matching the builder, pricing and budget logic.
begin;
create or replace function public.validate_published_cakes(p_ids uuid[] default null) returns void
language plpgsql set search_path='' as $$
declare v_missing text;
begin
 select t.name into v_missing from public.cake_types t where t.active and (p_ids is null or t.id=any(p_ids)) and (
   t.base_price is null or t.lead_time_value<=0 or t.tax_class='REQUIRES_REVIEW'
   or exists(select 1 from unnest(array['size','flavour']) required(type)
     where not exists(select 1 from public.cake_type_options link join public.custom_cake_options o on o.id=link.option_id
       where link.cake_type_id=t.id and o.active and o.type=required.type))
 ) limit 1;
 if v_missing is not null then raise exception 'Complete price, tax, preparation time and at least one size and flavour before publishing %',v_missing; end if;
end; $$;
commit;

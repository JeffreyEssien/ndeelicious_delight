-- Custom cakes are browsed from the shop (with occasion sub-categories), so the header only
-- links Shop, Ready to bake and Our story. The /custom-cakes page itself stays available.
begin;
update public.site_settings
set value = jsonb_set(
    value,
    '{global,navigation}',
    (
      select coalesce(jsonb_agg(item order by position), '[]'::jsonb)
      from jsonb_array_elements(value #> '{global,navigation}') with ordinality as nav(item, position)
      where item ->> 'href' <> '/custom-cakes'
    )
  ),
  updated_at = now()
where key = 'content'
  and jsonb_typeof(value #> '{global,navigation}') = 'array'
  and exists (
    select 1 from jsonb_array_elements(value #> '{global,navigation}') item
    where item ->> 'href' = '/custom-cakes'
  );
commit;

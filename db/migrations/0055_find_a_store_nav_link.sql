-- Add "Find a store" to the header navigation, pointing at the stockist list on the
-- Ready to bake page. Skipped when a link to that list is already there.
begin;
update public.site_settings
set value = jsonb_set(
    value,
    '{global,navigation}',
    (value #> '{global,navigation}') || '[{"label":"Find a store","href":"/ready-to-bake#stores"}]'::jsonb
  ),
  updated_at = now()
where key = 'content'
  and jsonb_typeof(value #> '{global,navigation}') = 'array'
  and not exists (
    select 1 from jsonb_array_elements(value #> '{global,navigation}') item
    where item ->> 'href' = '/ready-to-bake#stores'
  );
commit;

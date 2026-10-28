-- The founder's portrait for the Our Story page (only where no photo has been chosen yet), and
-- homepage cake steps that match the cake builder: a cake is a request the bakery confirms.
begin;
update public.site_settings
set value = jsonb_set(value, '{about,founder,image}', '"/about/ndidiamaka.jpg"'::jsonb),
  updated_at = now()
where key = 'content'
  and value #> '{about,founder}' is not null
  and coalesce(value #>> '{about,founder,image}', '') = '';

update public.site_settings
set value = jsonb_set(
    value,
    '{home,cakeFeature,steps}',
    '["Choose your cake, size and flavour", "Add your design, colours and message", "Pick your date and send your request — we’ll confirm the details"]'::jsonb
  ),
  updated_at = now()
where key = 'content'
  and value #> '{home,cakeFeature,steps}' is not null;
commit;

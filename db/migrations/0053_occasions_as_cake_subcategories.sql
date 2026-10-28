-- Occasions are no longer a cake choice; they are sub-categories under Custom cakes.
-- Copy each occasion into a Custom cakes collection, then retire the occasion choices.
-- Past requests keep the occasion text they were saved with.
begin;
insert into public.collections(parent, name, slug, sort_order, active)
select 'CUSTOM_CAKES', o.name, s.slug,
  coalesce((select max(c.sort_order) + 1 from public.collections c where c.parent = 'CUSTOM_CAKES'), 0)
    + row_number() over (order by o.sort_order, o.name) - 1,
  true
from public.custom_cake_options o
cross join lateral (
  select trim(both '-' from regexp_replace(lower(trim(o.name)), '[^a-z0-9]+', '-', 'g')) as base
) b
-- Slugs are unique across every group, so fall back to "<name>-cakes" when the plain one is taken.
cross join lateral (
  select case when exists(select 1 from public.collections c where c.slug = b.base)
    then b.base || '-cakes' else b.base end as slug
) s
where o.type = 'occasion' and o.active and b.base <> ''
  and not exists (
    select 1 from public.collections c
    where c.parent = 'CUSTOM_CAKES' and lower(trim(c.name)) = lower(trim(o.name))
  )
on conflict (slug) do nothing;

update public.custom_cake_options set active = false where type = 'occasion' and active;
commit;

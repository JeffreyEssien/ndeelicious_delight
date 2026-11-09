-- Custom cakes need a week's notice. Raise every custom cake product and cake type below 7 days
-- (168 hours) to 7 days. Longer times are kept, and the owner can still change any cake afterwards.
-- New cakes start at 7 days in the admin editor (CUSTOM_CAKE_PREPARATION_HOURS). Orders and cake
-- requests already placed keep the times saved on them.
begin;
update public.products p
set preparation_hours = 168, updated_at = now()
from public.categories c
where p.category_id = c.id
  and c.slug = 'custom-cakes'
  and p.preparation_hours < 168;

update public.cake_types
set lead_time_value = 7, lead_time_unit = 'days'
where lead_time_value * case lead_time_unit when 'hours' then 1 when 'days' then 24 when 'weeks' then 168 end < 168;
commit;

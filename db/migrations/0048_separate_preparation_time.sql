-- Preparation time is per product again, separate from the shop-wide 24-hour minimum lead time that
-- the app applies when scheduling orders (whichever is longer wins). New products start at no
-- preparation time. 0047 raised every shorter preparation time to 24 hours, and a 24-hour preparation
-- time schedules exactly like none at all, so those return to 0 for the owner to set in hours and minutes.
-- The default changes first: products has a deferred trigger (see 0047).
begin;
alter table public.products alter column preparation_hours set default 0;
update public.products set preparation_hours = 0 where preparation_hours = 24;
commit;

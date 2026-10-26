-- Every product needs at least 24 hours between an order being placed and it being ready.
-- Raise shorter lead times and make 24 hours the default for new products. The app enforces
-- the same minimum on save and when scheduling orders.
begin;
update public.products set preparation_hours = 24 where preparation_hours < 24;
alter table public.products alter column preparation_hours set default 24;
commit;

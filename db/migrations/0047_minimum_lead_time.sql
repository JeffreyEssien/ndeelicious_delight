-- Every product needs at least 24 hours between an order being placed and it being ready.
-- Make 24 hours the default for new products and raise shorter lead times. The app enforces
-- the same minimum on save and when scheduling orders.
-- The default changes first: products has a deferred trigger, and Postgres refuses ALTER TABLE
-- while trigger events from the update are still pending in the same transaction.
begin;
alter table public.products alter column preparation_hours set default 24;
update public.products set preparation_hours = 24 where preparation_hours < 24;
commit;

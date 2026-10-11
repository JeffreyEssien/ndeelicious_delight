-- Retain the existing hours contract while allowing whole-minute preparation.
-- Existing values are preserved; callers store minutes divided by 60.
alter table public.products alter column preparation_hours type double precision using preparation_hours::double precision;
alter table public.products add constraint products_preparation_whole_minutes check (
 abs(preparation_hours * 60 - round((preparation_hours * 60)::numeric)::double precision) < 0.000001
);

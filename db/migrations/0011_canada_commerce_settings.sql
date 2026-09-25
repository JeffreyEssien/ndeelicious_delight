-- Canada-first commerce settings, address fields, tax snapshots, and CAD defaults.

update public.site_settings
set value = value || jsonb_build_object(
  'country', 'CA',
  'locale', 'en-CA',
  'timezone', 'America/Toronto',
  'province', '',
  'postalCode', '',
  'currency', 'CAD',
  'taxEnabled', false,
  'taxLabel', 'Tax',
  'taxRateBps', 0,
  'taxDelivery', true,
  'address', case when value ->> 'address' in ('Lagos, Nigeria', 'Lagos') then '' else coalesce(value ->> 'address', '') end
), updated_at = now()
where key = 'business';

update public.site_settings
set value = replace(
  replace(
    replace(
      replace(
        replace(value::text, 'configured Lagos zones', 'configured delivery zones'),
        'Lagos celebrations', 'Canadian celebrations'
      ),
      'Handmade in Lagos', 'Handmade in Canada'
    ),
    'Lagos kitchen', 'Canadian kitchen'
  ),
  'Careful Lagos delivery', 'Careful local delivery'
)::jsonb, updated_at = now()
where key = 'content';

-- Keep legacy rows available for review in admin without offering Nigerian areas to customers.
update public.delivery_zones
set active = false, updated_at = now()
where lower(name) in ('lekki phase 1', 'ikoyi', 'victoria island', 'ajah', 'chevron');

insert into public.site_settings (key, value)
values (
  'appearance',
  '{"useCustomColors":false,"colors":{"background":"#faf8f5","surface":"#ffffff","text":"#211c19","mutedText":"#706965","primary":"#792f49","primaryDark":"#5d2137","accent":"#c89b49"},"contentWidth":"standard","sectionSpacing":"comfortable","cornerStyle":"soft","productColumns":4}'::jsonb
)
on conflict (key) do nothing;

alter table public.delivery_addresses
  add column if not exists address_line_2 text,
  add column if not exists province text,
  add column if not exists postal_code text,
  add column if not exists country char(2) not null default 'CA';

alter table public.orders
  add column if not exists tax_total integer not null default 0,
  add column if not exists tax_rate_bps integer not null default 0;

alter table public.orders alter column currency set default 'CAD';
alter table public.payments alter column currency set default 'CAD';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_tax_total_nonnegative') then
    alter table public.orders add constraint orders_tax_total_nonnegative check (tax_total >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_tax_rate_valid') then
    alter table public.orders add constraint orders_tax_rate_valid check (tax_rate_bps between 0 and 10000) not valid;
  end if;
end $$;
alter table public.orders validate constraint orders_tax_total_nonnegative;
alter table public.orders validate constraint orders_tax_rate_valid;

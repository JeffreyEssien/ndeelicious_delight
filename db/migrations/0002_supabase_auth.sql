-- Supabase Auth linkage and baseline Row Level Security.
-- Run after 0001_initial.sql in the Supabase SQL editor or migration runner.

alter table public.admins
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete restrict;

create index if not exists admins_auth_user_id_idx on public.admins(auth_user_id);

create schema if not exists private;

create or replace function private.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admins
    where auth_user_id = (select auth.uid())
      and active = true
  );
$$;

revoke all on function private.is_active_admin() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_active_admin() to authenticated;

alter table public.admins enable row level security;
revoke all on table public.admins from anon, authenticated;
grant select on table public.admins to authenticated;
drop policy if exists "Admins can read their membership" on public.admins;
create policy "Admins can read their membership"
  on public.admins for select
  to authenticated
  using ((select auth.uid()) = auth_user_id and active = true);

-- Only active admins receive authenticated CRUD access to operational tables.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'customers','categories','products','product_variants','product_images',
    'custom_cake_options','delivery_zones','delivery_addresses','carts','cart_items',
    'coupons','orders','order_items','custom_cake_orders','payments','coupon_usages',
    'reviews','contact_messages','newsletter_subscribers','site_settings','audit_logs',
    'processed_webhooks'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
    execute format('drop policy if exists "Active admins manage %s" on public.%I', table_name, table_name);
    execute format(
      'create policy "Active admins manage %s" on public.%I for all to authenticated using ((select private.is_active_admin())) with check ((select private.is_active_admin()))',
      table_name,
      table_name
    );
  end loop;
end
$$;

-- Public storefront catalogue access. Writes remain admin-only.
grant select on table public.categories, public.products, public.product_variants,
  public.product_images, public.custom_cake_options, public.delivery_zones to anon;

drop policy if exists "Public reads active categories" on public.categories;
create policy "Public reads active categories" on public.categories for select to anon using (active = true);
drop policy if exists "Public reads active products" on public.products;
create policy "Public reads active products" on public.products for select to anon using (status = 'ACTIVE');
drop policy if exists "Public reads active product variants" on public.product_variants;
create policy "Public reads active product variants" on public.product_variants for select to anon using (
  active = true and exists (
    select 1 from public.products
    where products.id = product_variants.product_id and products.status = 'ACTIVE'
  )
);
drop policy if exists "Public reads product images" on public.product_images;
create policy "Public reads product images" on public.product_images for select to anon using (
  exists (
    select 1 from public.products
    where products.id = product_images.product_id and products.status = 'ACTIVE'
  )
);
drop policy if exists "Public reads active cake options" on public.custom_cake_options;
create policy "Public reads active cake options" on public.custom_cake_options for select to anon using (active = true);
drop policy if exists "Public reads active delivery zones" on public.delivery_zones;
create policy "Public reads active delivery zones" on public.delivery_zones for select to anon using (active = true);

-- After creating the owner in Authentication > Users, link that identity once:
-- insert into public.admins (auth_user_id, email, name, role)
-- select id, email, 'Ndeeelicious Owner', 'OWNER'
-- from auth.users where email = 'owner@example.com';

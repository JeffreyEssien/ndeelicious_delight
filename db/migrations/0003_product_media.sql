-- Product media storage for Phase 5 product management.
alter table public.product_images
  add column if not exists storage_path text;

-- Out-of-stock products remain visible as unavailable; drafts and archives remain private.
drop policy if exists "Public reads active products" on public.products;
create policy "Public reads active products"
  on public.products for select
  to anon
  using (status in ('ACTIVE', 'OUT_OF_STOCK'));

drop policy if exists "Public reads active product variants" on public.product_variants;
create policy "Public reads active product variants"
  on public.product_variants for select
  to anon
  using (
    active = true and exists (
      select 1 from public.products
      where products.id = product_variants.product_id
        and products.status in ('ACTIVE', 'OUT_OF_STOCK')
    )
  );

drop policy if exists "Public reads product images" on public.product_images;
create policy "Public reads product images"
  on public.product_images for select
  to anon
  using (
    exists (
      select 1 from public.products
      where products.id = product_images.product_id
        and products.status in ('ACTIVE', 'OUT_OF_STOCK')
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Active admins upload product images" on storage.objects;
create policy "Active admins upload product images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images' and (select private.is_active_admin()));

drop policy if exists "Active admins update product images" on storage.objects;
create policy "Active admins update product images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-images' and (select private.is_active_admin()))
  with check (bucket_id = 'product-images' and (select private.is_active_admin()));

drop policy if exists "Active admins remove product images" on storage.objects;
create policy "Active admins remove product images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-images' and (select private.is_active_admin()));

drop policy if exists "Active admins read product image objects" on storage.objects;
create policy "Active admins read product image objects"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'product-images' and (select private.is_active_admin()));

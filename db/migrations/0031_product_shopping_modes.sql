begin;
alter table public.products add column shopping_mode text not null default 'READY_TO_ORDER' check (shopping_mode in ('READY_TO_ORDER','MADE_TO_ORDER','READY_TO_BAKE')), add column preparation_hours integer not null default 0 check (preparation_hours between 0 and 8760);
update public.products p set shopping_mode = 'READY_TO_BAKE' from public.categories c where p.category_id = c.id and c.slug = 'ready-to-bake';

alter table public.orders add column preparation_ready_at timestamptz;
create or replace function public.enforce_product_preparation() returns trigger
language plpgsql set search_path = public as $$
begin
 if new.status::text in ('READY','OUT_FOR_DELIVERY','DELIVERED') and new.preparation_ready_at > current_timestamp then
   raise exception 'PRODUCT_PREPARATION_PENDING';
 end if;
 return new;
end $$;
create trigger product_preparation_window before update of status on public.orders for each row execute function public.enforce_product_preparation();

-- Merchandising remains editable through the existing content editor.
update public.site_settings
set value = jsonb_set(value, '{home,categories}', jsonb_build_array(
 jsonb_build_object('eyebrow','Fresh from the bakery','title','Ready to Order','body','Browse fresh products currently available to order.','linkLabel','Shop available products','href','/shop?mode=READY_TO_ORDER','image',coalesce(value #>> '{home,categories,1,image}','/pastries.jpg'),'imageAlt','Fresh bakery products'),
 jsonb_build_object('eyebrow','Prepared for you','title','Made to Order','body','Choose your pack and we’ll prepare it for you.','linkLabel','Choose your pack','href','/shop?mode=MADE_TO_ORDER','image',coalesce(value #>> '{home,categories,1,image}','/pastries.jpg'),'imageAlt','Made-to-order bakery products'),
 jsonb_build_object('eyebrow','For your oven','title','Ready to Bake','body','Bakery-prepared favourites for baking at home, with instructions included.','linkLabel','Explore ready to bake','href','/shop?mode=READY_TO_BAKE','image',coalesce(value #>> '{home,categories,2,image}','/ready-to-bake.jpg'),'imageAlt','Ready-to-bake products')
)) where key = 'content';
commit;

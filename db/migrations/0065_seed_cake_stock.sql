-- Stock every cake size with 100 units, so no cake shows as sold out while the owner sets real
-- numbers. Covers each size (product variant) of every product in Custom cakes, active or not;
-- retired sizes are left alone. Product totals and OUT_OF_STOCK -> ACTIVE follow from the
-- variant stock trigger. Stock can be changed per size in the admin afterwards.
begin;
update public.product_variants v
set stock_quantity = 100, updated_at = now()
from public.products p
join public.categories c on c.id = p.category_id
where v.product_id = p.id
  and c.slug = 'custom-cakes'
  and v.retired_at is null
  and v.stock_quantity <> 100;
commit;

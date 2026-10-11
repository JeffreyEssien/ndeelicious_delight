create index if not exists products_inventory_status_name_idx on public.products(status,name,id);
create index if not exists variants_inventory_product_active_idx on public.product_variants(product_id,active,stock_quantity);
create or replace function public.admin_inventory_page(p_filters jsonb default '{}')
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_size integer:=coalesce((p_filters->>'size')::integer,25); v_page integer:=coalesce((p_filters->>'page')::integer,1); v_result jsonb;
begin
 if v_size not in (25,50,100) or v_page<1 or v_page>1000000 then raise exception 'Invalid inventory query'; end if;
 with base as materialized (
   select p.id,p.name,p.stock_quantity,p.track_inventory,p.status,
     p.track_inventory and p.status not in ('DRAFT','ARCHIVED') as tracked,
     exists(select 1 from public.product_variants v where v.product_id=p.id and v.active and v.stock_quantity=0) as is_out,
     exists(select 1 from public.product_variants v where v.product_id=p.id and v.active and v.stock_quantity>0 and v.stock_quantity<=p.low_stock_threshold) as is_low,
     strpos(lower(p.name||' '||coalesce(p.sku,'')||' '||coalesce(c.name,'')),lower(coalesce(p_filters->>'q','')))>0
       or exists(select 1 from public.product_variants v where v.product_id=p.id and strpos(lower(v.name||' '||coalesce(v.sku,'')),lower(p_filters->>'q'))>0) as matches
   from public.products p left join public.categories c on c.id=p.category_id
 ), categorized as materialized (
   select b.*,array_remove(array[
     case when tracked then 'ALL' end, case when tracked and (is_low or is_out) then 'ATTENTION' end,
     case when tracked and is_low then 'LOW' end, case when tracked and is_out then 'OUT' end,
     case when not track_inventory then 'UNTRACKED' end,case when status in ('DRAFT','ARCHIVED') then 'INACTIVE' end
   ],null) as categories from base b
 ), filtered as materialized (select * from categorized where matches and coalesce(p_filters->>'category','ALL')=any(categories)),
 paged as (select * from filtered order by
   case when p_filters->>'sort'='quantity' then stock_quantity end asc,
   name asc,id asc limit v_size offset (v_page-1)*v_size),
 counts as (select category,count(*) as n from categorized,unnest(categories) category group by category)
 select jsonb_build_object('ids',coalesce((select jsonb_agg(id order by case when p_filters->>'sort'='quantity' then stock_quantity end asc,name,id) from paged),'[]'::jsonb),
   'total',(select count(*) from filtered),'counts',coalesce((select jsonb_object_agg(category,n) from counts),'{}'::jsonb),'page',v_page,'size',v_size) into v_result;
 return v_result;
end; $$;
revoke all on function public.admin_inventory_page(jsonb) from public,anon,authenticated;
grant execute on function public.admin_inventory_page(jsonb) to service_role;

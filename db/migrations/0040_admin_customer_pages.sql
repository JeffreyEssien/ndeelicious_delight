create index if not exists orders_customer_email_history_idx on public.orders(lower(email),created_at desc,id);
create or replace function public.admin_customer_page(p_query text default '',p_page integer default 1,p_size integer default 25)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_result jsonb;
begin
 if p_size not in (25,50,100) or p_page<1 or p_page>1000000 or length(p_query)>200 then raise exception 'Invalid customer query'; end if;
 with customers as materialized (
   select lower(email) as email,(array_agg(customer_name order by created_at desc,id desc))[1] as name,
     count(*) as orders,coalesce(sum(grand_total) filter(where status not in ('CANCELLED','FAILED','PENDING_PAYMENT','REFUNDED')),0) as spent,max(created_at) as last
   from public.orders group by lower(email)
 ), matching as materialized (
   select * from customers where strpos(lower(name||' '||email),lower(p_query))>0
 ), paged as (
   select * from matching order by last desc,email limit p_size offset (p_page-1)*p_size
 )
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(paged) order by last desc,email) from paged),'[]'::jsonb),'total',(select count(*) from matching),'page',p_page,'size',p_size) into v_result;
 return v_result;
end; $$;
revoke all on function public.admin_customer_page(text,integer,integer) from public,anon,authenticated;
grant execute on function public.admin_customer_page(text,integer,integer) to service_role;

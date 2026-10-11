-- Dashboard aggregates remain in PostgreSQL; only five recent summaries leave
-- the database. Retain the established analytics payment/refund semantics.
create index if not exists payments_dashboard_date_idx on public.payments(order_id,(coalesce(paid_at,created_at)) desc,id desc);
create or replace function public.admin_dashboard_summary(p_now timestamptz default now()) returns jsonb
language sql stable security invoker set search_path='' as $$
with paid as materialized (
 select o.id, lower(trim(o.email)) email,
 coalesce(p.paid_at,o.created_at) paid_at,
 case when p.id is not null then p.amount else o.grand_total end gross,
 coalesce(p.refunded_amount,case when o.status='REFUNDED' then o.grand_total else 0 end) refunds
 from public.orders o left join lateral (
   select p.id,p.amount,p.refunded_amount,p.paid_at,p.created_at,p.status from public.payments p where p.order_id=o.id
   order by coalesce(p.paid_at,p.created_at) desc,p.id desc limit 1
 ) p on true
 where case when p.id is not null then p.status::text in ('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED')
   else o.status::text in ('PAID','CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED','REFUNDED') end
), totals as (
 select greatest(0,coalesce(sum(gross-refunds) filter(where paid_at>=p_now-interval '30 days' and paid_at<p_now),0)) revenue,
 coalesce(sum(greatest(0,gross-refunds)) filter(where paid_at>=p_now-interval '60 days' and paid_at<p_now-interval '30 days'),0) previous,
 count(*) filter(where paid_at>=p_now-interval '30 days' and paid_at<p_now) paid_orders
 from paid
), customers as (
 select email, count(*) filter(where paid_at>=p_now-interval '30 days' and paid_at<p_now) current_orders,
 bool_or(paid_at<p_now-interval '30 days') prior from paid group by email
), returning_stats as (
 select count(*) filter(where current_orders>0) customers,
 count(*) filter(where current_orders>0 and (prior or current_orders>1)) returned from customers
), stock as (
 select count(*) low from public.products p where p.status='ACTIVE' and p.track_inventory and exists (
   select 1 from public.product_variants v where v.product_id=p.id and v.active and v.stock_quantity<=p.low_stock_threshold
 )
), recent as (
 select o.id,o.order_number,o.customer_name,o.created_at,o.grand_total,o.status,o.fulfilment
 from public.orders o order by o.created_at desc,o.id desc limit 5
)
select jsonb_build_object(
 'netRevenue',t.revenue,'paidOrders',t.paid_orders,
 'averageOrderValue',case when t.paid_orders>0 then round(t.revenue::numeric/t.paid_orders) else 0 end,
 'revenueChange',case when t.previous>0 then (t.revenue-t.previous)*100.0/t.previous when t.revenue=0 then 0 else null end,
 'returningCustomers',r.returned,'repeatCustomerRate',case when r.customers>0 then r.returned*100.0/r.customers else 0 end,
 'lowStockProducts',s.low,
 'waitingQuotes',(select count(*) from public.custom_cake_orders where status in ('DRAFT','QUOTE_REQUIRED')),
 'recentOrders',coalesce((select jsonb_agg(jsonb_build_object('id',o.order_number,'customer',o.customer_name,'date',o.created_at,'total',o.grand_total,'status',o.status,'fulfilment',o.fulfilment,
   'items',(select coalesce(sum(i.quantity),0) from public.order_items i where i.order_id=o.id)) order by o.created_at desc,o.id desc) from recent o),'[]'::jsonb)
) from totals t cross join returning_stats r cross join stock s;
$$;
revoke all on function public.admin_dashboard_summary(timestamptz) from public,anon,authenticated;
grant execute on function public.admin_dashboard_summary(timestamptz) to service_role;

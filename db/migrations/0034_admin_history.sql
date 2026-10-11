-- Summary-only history access. Executable exclusively by the server service role;
-- API handlers must validate the administrator session before calling these RPCs.
create index if not exists orders_history_created_idx on public.orders(created_at desc, id desc);
create index if not exists orders_history_status_idx on public.orders(status, created_at desc, id desc);
create index if not exists orders_history_total_idx on public.orders(grand_total, id);
create index if not exists cake_history_created_idx on public.custom_cake_orders(created_at desc, id desc);
create index if not exists cake_history_order_idx on public.custom_cake_orders(order_id, requested_date);
create index if not exists payments_history_order_idx on public.payments(order_id, created_at desc, id desc);
create index if not exists order_items_history_order_idx on public.order_items(order_id);

create or replace function public.admin_history_page(p_kind text, p_filters jsonb default '{}')
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_size integer := coalesce((p_filters->>'size')::integer,25);
  v_page integer := coalesce((p_filters->>'page')::integer,1);
  v_as_of timestamptz := coalesce((p_filters->>'asOf')::timestamptz,now());
  v_result jsonb;
  v_today date := (now() at time zone coalesce((select value->>'timezone' from public.site_settings where key='business'),'America/Halifax'))::date;
begin
  if p_kind not in ('orders','cakes') or v_size not in (25,50,100) or v_page < 1 or v_page > 1000000 then
    raise exception 'Invalid history query';
  end if;
  with base as materialized (
    select o.id, o.order_number as number, o.customer_name as customer, o.email, o.phone,
      o.status::text as status, o.created_at, o.grand_total as total, o.currency::text,
      o.fulfilment, coalesce(p.status::text,'UNPAID') as payment_status,
      (select min(c.requested_date) from public.custom_cake_orders c where c.order_id=o.id) as deadline,
      null::text as occasion
    from public.orders o
    left join lateral (select p.status from public.payments p where p.order_id=o.id
      order by p.created_at desc, p.id desc limit 1) p on true
    where p_kind='orders' and o.created_at<=v_as_of
    union all
    select c.id,c.request_number,c.customer_name,c.email,c.phone,c.status::text,c.created_at,
      coalesce(c.quoted_total,c.estimated_total),null::text,null::text,null::text,
      c.requested_date,c.configuration->>'occasion'
    from public.custom_cake_orders c where p_kind='cakes' and c.created_at<=v_as_of
  ), categorized as materialized (
    select b.*, array_remove(array[
      'ALL',
      case when p_kind='orders' and status not in ('CANCELLED','REFUNDED','DELIVERED') and (status='FAILED' or payment_status='FAILED') then 'ATTENTION'
        when p_kind='cakes' and (status in ('DRAFT','QUOTE_REQUIRED') or
          (deadline<v_today and status not in ('DELIVERED','CANCELLED','REFUNDED'))) then 'ATTENTION' end,
      case when p_kind='orders' and status='PENDING_PAYMENT' then 'AWAITING_PAYMENT' end,
      case when status in ('PAID','CONFIRMED','CUSTOMER_APPROVED') then 'TO_PREPARE' end,
      case when status='PREPARING' then 'PREPARING' end,
      case when status='READY' then 'READY' end,
      case when status='OUT_FOR_DELIVERY' or (p_kind='orders' and status='READY' and fulfilment='pickup') then 'OUT' end,
      case when status='DELIVERED' then 'COMPLETED' end,
      case when status='CANCELLED' then 'CANCELLED' end,
      case when p_kind='cakes' and status in ('DRAFT','QUOTE_REQUIRED') then 'NEEDS_QUOTE' end,
      case when p_kind='cakes' and status='QUOTE_SENT' then 'QUOTE_SENT' end,
      case when p_kind='cakes' and status='QUOTE_SENT' then 'AWAITING_APPROVAL' end
    ],null) as categories from base b
  ), filtered as materialized (
    select * from categorized b where
      (coalesce(p_filters->>'category','ALL')=any(b.categories))
      and (coalesce(p_filters->>'q','')='' or strpos(lower(b.number||' '||b.customer||' '||b.email||' '||b.phone),lower(p_filters->>'q'))>0)
      and (coalesce(p_filters->>'stage','')='' or b.status=p_filters->>'stage')
      and (coalesce(p_filters->>'payment','')='' or b.payment_status=p_filters->>'payment')
      and (coalesce(p_filters->>'fulfilment','')='' or b.fulfilment=p_filters->>'fulfilment')
      and (coalesce(p_filters->>'from','')='' or b.created_at >= (p_filters->>'from')::date)
      and (coalesce(p_filters->>'to','')='' or b.created_at < (p_filters->>'to')::date+interval '1 day')
  ), numbered as (
    select f.*, row_number() over (order by
      case when p_filters->>'sort'='oldest' then created_at end asc,
      case when p_filters->>'sort'='total-asc' then total end asc nulls last,
      case when p_filters->>'sort'='total-desc' then total end desc nulls last,
      case when p_filters->>'sort'='deadline' then deadline end asc nulls last,
      case when coalesce(p_filters->>'sort','newest')='newest' then created_at end desc,
      id desc) as position from filtered f
  ), paged as (
    select * from numbered order by position limit v_size offset (v_page-1)*v_size
  ), category_counts as (
    select category, count(*) as count from categorized, unnest(categories) category group by category
  )
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'number',r.number,'customer',r.customer,'status',r.status,'createdAt',r.created_at,
      'total',r.total,'currency',r.currency,'fulfilment',r.fulfilment,'paymentStatus',r.payment_status,
      'deadline',r.deadline,'occasion',r.occasion,
      'referencePath',case when p_kind='cakes' then (select c.reference_urls[1] from public.custom_cake_orders c where c.id=r.id) end,
      'items',case when p_kind='orders' then (select coalesce(sum(i.quantity),0) from public.order_items i where i.order_id=r.id) end
    ) order by position) from paged r),'[]'::jsonb),
    'total',(select count(*) from filtered),
    'counts',coalesce((select jsonb_object_agg(category,count) from category_counts),'{}'::jsonb),
    'page',v_page,'size',v_size,'asOf',v_as_of
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.admin_history_page(text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_history_page(text,jsonb) to service_role;

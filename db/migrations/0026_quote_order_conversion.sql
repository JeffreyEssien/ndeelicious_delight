-- Atomically convert one accepted quote into exactly one payable order.
create or replace function public.create_order_from_accepted_quote(
  p_token_hash text,
  p_fulfilment text,
  p_delivery_zone_id uuid default null,
  p_address jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.business_documents;
  v_cake public.custom_cake_orders;
  v_order public.orders;
  v_customer_id uuid;
  v_zone public.delivery_zones;
  v_subtotal integer;
  v_delivery integer := 0;
  v_tax integer := 0;
  v_total integer;
  v_number text;
begin
  if p_fulfilment not in ('pickup', 'delivery') then
    raise exception using errcode = '22023', message = 'INVALID_FULFILMENT';
  end if;
  select documents.* into v_document
  from public.document_access_tokens tokens
  join public.business_documents documents on documents.id = tokens.document_id
  where tokens.token_hash = p_token_hash and tokens.revoked_at is null and tokens.expires_at > now()
    and documents.kind = 'QUOTE'
  for update of documents;
  if v_document.id is null then raise exception using errcode = 'P0002', message = 'QUOTE_NOT_AVAILABLE'; end if;
  if v_document.state <> 'ACCEPTED' then raise exception using errcode = 'P0001', message = 'QUOTE_NOT_ACCEPTED'; end if;
  select * into v_cake from public.custom_cake_orders where id = v_document.cake_order_id for update;
  if v_cake.order_id is not null then
    select * into v_order from public.orders where id = v_cake.order_id;
    return jsonb_build_object('orderId', v_order.id, 'orderNumber', v_order.order_number,
      'total', v_order.grand_total, 'email', v_order.email, 'currency', v_order.currency);
  end if;
  if p_fulfilment = 'pickup' and coalesce((v_document.business_snapshot->>'pickupEnabled')::boolean, false) = false then
    raise exception using errcode = 'P0001', message = 'PICKUP_UNAVAILABLE';
  end if;
  if p_fulfilment = 'delivery' then
    if coalesce((v_document.business_snapshot->>'deliveryEnabled')::boolean, false) = false then
      raise exception using errcode = 'P0001', message = 'DELIVERY_UNAVAILABLE';
    end if;
    select * into v_zone from public.delivery_zones where id = p_delivery_zone_id and active = true;
    if v_zone.id is null or p_address is null then raise exception using errcode = '22023', message = 'DELIVERY_DETAILS_REQUIRED'; end if;
    v_delivery := v_zone.fee;
  end if;
  v_subtotal := (v_document.totals_snapshot->>'total')::integer;
  if p_fulfilment = 'delivery' and v_subtotal < coalesce(v_zone.minimum_order, 0) then
    raise exception using errcode = 'P0001', message = 'DELIVERY_MINIMUM';
  end if;
  if coalesce((v_document.business_snapshot->>'taxEnabled')::boolean, false) then
    v_tax := round((v_subtotal + case when coalesce((v_document.business_snapshot->>'taxDelivery')::boolean, false) then v_delivery else 0 end)
      * coalesce((v_document.business_snapshot->>'taxRateBps')::integer, 0) / 10000.0);
  end if;
  v_total := v_subtotal + v_delivery + v_tax;
  insert into public.customers(email, name, phone)
  values (lower(v_cake.email), v_cake.customer_name, v_cake.phone)
  on conflict (email) do update set name = excluded.name, phone = excluded.phone
  returning id into v_customer_id;
  v_number := 'ND-' || right(extract(epoch from clock_timestamp())::bigint::text, 7) || floor(random() * 10)::integer::text;
  insert into public.orders(order_number, customer_id, customer_name, email, phone, status, fulfilment,
    delivery_zone_id, delivery_address_snapshot, subtotal, discount_total, delivery_fee, tax_total,
    tax_rate_bps, grand_total, currency, customer_note)
  values (v_number, v_customer_id, v_cake.customer_name, lower(v_cake.email), v_cake.phone, 'PENDING_PAYMENT',
    p_fulfilment, case when p_fulfilment = 'delivery' then p_delivery_zone_id else null end,
    case when p_fulfilment = 'delivery' then p_address else null end, v_subtotal, 0, v_delivery, v_tax,
    coalesce((v_document.business_snapshot->>'taxRateBps')::integer, 0), v_total,
    coalesce(v_document.business_snapshot->>'currency', 'CAD'), v_cake.customer_note)
  returning * into v_order;
  insert into public.order_items(order_id, product_id, variant_id, product_name, variant_name, sku,
    unit_price, quantity, discount, final_price, product_snapshot)
  values (v_order.id, null, null, v_document.line_items_snapshot->0->>'name',
    v_document.line_items_snapshot->0->>'detail', null, v_subtotal, 1, 0, v_subtotal,
    jsonb_build_object('type', 'CUSTOM_CAKE', 'cakeOrderId', v_cake.id,
      'configuration', v_cake.configuration, 'quoteDocumentId', v_document.id));
  update public.custom_cake_orders set order_id = v_order.id, status = 'PENDING_PAYMENT', updated_at = now()
  where id = v_cake.id;
  return jsonb_build_object('orderId', v_order.id, 'orderNumber', v_order.order_number,
    'total', v_order.grand_total, 'email', v_order.email, 'currency', v_order.currency);
end;
$$;

revoke all on function public.create_order_from_accepted_quote(text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_order_from_accepted_quote(text, text, uuid, jsonb) to service_role;

create or replace function public.sync_custom_cake_from_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = new.status then return new; end if;
  update public.custom_cake_orders
  set status = case new.status
    when 'PENDING_PAYMENT' then 'PENDING_PAYMENT'::public.cake_status
    when 'PAID' then 'PAID'::public.cake_status
    when 'CONFIRMED' then 'CONFIRMED'::public.cake_status
    when 'PREPARING' then 'PREPARING'::public.cake_status
    when 'READY' then 'READY'::public.cake_status
    when 'OUT_FOR_DELIVERY' then 'OUT_FOR_DELIVERY'::public.cake_status
    when 'DELIVERED' then 'DELIVERED'::public.cake_status
    when 'CANCELLED' then 'CANCELLED'::public.cake_status
    when 'REFUNDED' then 'REFUNDED'::public.cake_status
    else status
  end,
  updated_at = now()
  where order_id = new.id;
  return new;
end;
$$;

drop trigger if exists sync_custom_cake_order_status on public.orders;
create trigger sync_custom_cake_order_status
after update of status on public.orders
for each row execute function public.sync_custom_cake_from_order();

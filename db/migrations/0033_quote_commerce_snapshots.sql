begin;
-- Atomically convert one accepted quote into exactly one payable order.
create or replace function public.create_order_from_accepted_quote_v2(
  p_token_hash text,
  p_fulfilment text,
  p_delivery_zone_id uuid default null,
  p_address jsonb default null,
  p_pricing jsonb default null
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
  if p_fulfilment = 'delivery' then
    select * into v_zone from public.delivery_zones where id = p_delivery_zone_id and active = true;
    if v_zone.id is null or p_address is null then raise exception using errcode = '22023', message = 'DELIVERY_DETAILS_REQUIRED'; end if;
    v_delivery := v_zone.fee;
  end if;
  v_subtotal := (v_document.totals_snapshot->>'total')::integer;
  if p_fulfilment = 'delivery' and v_subtotal < coalesce(v_zone.minimum_order, 0) then
    raise exception using errcode = 'P0001', message = 'DELIVERY_MINIMUM';
  end if;
  if p_pricing is null or (p_pricing->>'subtotal')::integer <> v_subtotal then raise exception 'QUOTE_PRICING_MISMATCH'; end if;
  v_delivery := (p_pricing->>'deliveryFee')::integer;
  v_tax := (p_pricing->>'taxTotal')::integer;
  v_total := v_subtotal + v_delivery + v_tax;
  if v_delivery < 0 or v_tax < 0 or (p_pricing->>'grandTotal')::integer <> v_total then raise exception 'INVALID_QUOTE_PRICING'; end if;
  insert into public.customers(email, name, phone)
  values (lower(v_cake.email), v_cake.customer_name, v_cake.phone)
  on conflict (email) do update set name = excluded.name, phone = excluded.phone
  returning id into v_customer_id;
  v_number := 'ND-' || right(extract(epoch from clock_timestamp())::bigint::text, 7) || floor(random() * 10)::integer::text;
  insert into public.orders(order_number, customer_id, customer_name, email, phone, status, fulfilment,
    delivery_zone_id, delivery_address_snapshot, subtotal, discount_total, delivery_fee, tax_total,
    tax_rate_bps, grand_total, currency, customer_note, tax_snapshot, fulfilment_snapshot, preparation_ready_at)
  values (v_number, v_customer_id, v_cake.customer_name, lower(v_cake.email), v_cake.phone, 'PENDING_PAYMENT',
    p_fulfilment, case when p_fulfilment = 'delivery' then p_delivery_zone_id else null end,
    case when p_fulfilment = 'delivery' then p_address else null end, v_subtotal, 0, v_delivery, v_tax,
    case when (p_pricing->'taxSnapshot'->'lines'->0->>'rateBps')::integer > 0 then 1400 else 0 end, v_total,
    coalesce(v_document.business_snapshot->>'currency', 'CAD'), v_cake.customer_note, p_pricing->'taxSnapshot', p_pricing->'fulfilment', (p_pricing->'fulfilment'->>'earliestAt')::timestamptz)
  returning * into v_order;
  insert into public.order_items(order_id, product_id, variant_id, product_name, variant_name, sku,
    unit_price, quantity, discount, final_price, product_snapshot)
  values (v_order.id, null, null, v_document.line_items_snapshot->0->>'name',
    v_document.line_items_snapshot->0->>'detail', null, v_subtotal, 1, 0, v_subtotal,
    jsonb_build_object('type', 'CUSTOM_CAKE', 'cakeOrderId', v_cake.id,
      'configuration', v_cake.configuration, 'quoteDocumentId', v_document.id, 'tax', p_pricing->'taxSnapshot'->'lines'->0));
  update public.custom_cake_orders set order_id = v_order.id, status = 'PENDING_PAYMENT', updated_at = now()
  where id = v_cake.id;
  return jsonb_build_object('orderId', v_order.id, 'orderNumber', v_order.order_number,
    'total', v_order.grand_total, 'email', v_order.email, 'currency', v_order.currency);
end;
$$;

revoke all on function public.create_order_from_accepted_quote_v2(text, text, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_order_from_accepted_quote_v2(text, text, uuid, jsonb, jsonb) to service_role;


revoke all on function public.create_order_from_accepted_quote(text,text,uuid,jsonb) from service_role;
commit;

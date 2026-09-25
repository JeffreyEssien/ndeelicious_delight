-- Pending refund requests reserve refundable capacity until they succeed or fail.

create or replace function public.begin_order_refund(
  p_order_number text,
  p_amount integer,
  p_reason text,
  p_idempotency_key uuid,
  p_admin_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_payment record;
  v_refund record;
  v_pending integer;
begin
  select * into v_refund from public.order_refunds where idempotency_key = p_idempotency_key;
  if found then
    select provider_payload into v_payment from public.payments where id = v_refund.payment_id;
    return jsonb_build_object(
      'refundId', v_refund.id,
      'status', v_refund.status,
      'amount', v_refund.amount,
      'paymentIntentId', v_payment.provider_payload ->> 'payment_intent_id'
    );
  end if;
  select * into v_order from public.orders where order_number = p_order_number for update;
  if not found then raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND'; end if;
  if v_order.status not in ('PAID', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED') then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_REFUNDABLE';
  end if;
  select * into v_payment
  from public.payments
  where order_id = v_order.id and status in ('SUCCEEDED', 'PARTIALLY_REFUNDED')
  order by paid_at desc nulls last, created_at desc
  limit 1 for update;
  if not found then raise exception using errcode = 'P0002', message = 'PAYMENT_NOT_REFUNDABLE'; end if;
  select coalesce(sum(amount), 0)::integer into v_pending
  from public.order_refunds
  where payment_id = v_payment.id and status = 'PENDING';
  if p_amount < 1 or p_amount > v_payment.amount - v_payment.refunded_amount - v_pending then
    raise exception using errcode = '22023', message = 'INVALID_REFUND_AMOUNT';
  end if;
  if coalesce(v_payment.provider_payload ->> 'payment_intent_id', '') = '' then
    raise exception using errcode = 'P0002', message = 'PAYMENT_INTENT_MISSING';
  end if;
  insert into public.order_refunds(order_id, payment_id, amount, reason, idempotency_key, actor_admin_id)
  values (v_order.id, v_payment.id, p_amount, trim(p_reason), p_idempotency_key, p_admin_id)
  returning * into v_refund;
  insert into public.order_events(order_id, event_type, note, actor_admin_id, metadata)
  values (v_order.id, 'REFUND_REQUESTED', trim(p_reason), p_admin_id, jsonb_build_object('amount', p_amount));
  return jsonb_build_object(
    'refundId', v_refund.id,
    'status', v_refund.status,
    'amount', v_refund.amount,
    'paymentIntentId', v_payment.provider_payload ->> 'payment_intent_id'
  );
end;
$$;

-- Stripe Checkout lifecycle, atomic webhook processing, and safe payment retries.

create index if not exists payments_order_created_idx
  on public.payments(order_id, created_at desc);

create or replace function public.process_stripe_checkout_event(
  p_event_id text,
  p_event_type text,
  p_session_id text,
  p_payment_intent_id text,
  p_payment_status text,
  p_amount_total integer,
  p_currency text,
  p_provider_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment record;
  v_order record;
  v_became_paid boolean := false;
begin
  if coalesce(p_event_id, '') = '' or coalesce(p_session_id, '') = '' then
    raise exception using errcode = '22023', message = 'INVALID_STRIPE_EVENT';
  end if;

  insert into public.processed_webhooks(provider_event_id, event_type)
  values (p_event_id, p_event_type)
  on conflict (provider_event_id) do nothing;

  if not found then
    return jsonb_build_object('processed', false, 'becamePaid', false);
  end if;

  select * into v_payment
  from public.payments
  where provider = 'stripe' and provider_payment_id = p_session_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'PAYMENT_NOT_FOUND';
  end if;

  select * into v_order
  from public.orders
  where id = v_payment.order_id
  for update;

  if p_amount_total is null or p_amount_total <> v_payment.amount
    or upper(coalesce(p_currency, '')) <> upper(v_payment.currency) then
    raise exception using errcode = 'P0001', message = 'PAYMENT_AMOUNT_MISMATCH';
  end if;

  if p_event_type in ('checkout.session.completed', 'checkout.session.async_payment_succeeded')
    and (
      p_payment_status = 'paid'
      or (p_payment_status = 'no_payment_required' and v_payment.amount = 0)
    )
    and v_payment.status <> 'SUCCEEDED' then
    perform public.transition_order_status(v_order.order_number, 'PAID');
    update public.payments
      set status = 'SUCCEEDED',
        paid_at = now(),
        provider_payload = coalesce(provider_payload, '{}'::jsonb) || coalesce(p_provider_payload, '{}'::jsonb),
        updated_at = now()
      where id = v_payment.id;
    v_became_paid := true;
  elsif p_event_type in ('checkout.session.async_payment_failed', 'checkout.session.expired')
    and v_payment.status = 'PENDING' then
    update public.payments
      set status = 'FAILED',
        provider_payload = coalesce(provider_payload, '{}'::jsonb) || coalesce(p_provider_payload, '{}'::jsonb),
        updated_at = now()
      where id = v_payment.id;
    if v_order.status = 'PENDING_PAYMENT' then
      perform public.transition_order_status(v_order.order_number, 'FAILED');
    end if;
  else
    update public.payments
      set provider_payload = coalesce(provider_payload, '{}'::jsonb) || coalesce(p_provider_payload, '{}'::jsonb),
        updated_at = now()
      where id = v_payment.id;
  end if;

  return jsonb_build_object(
    'processed', true,
    'becamePaid', v_became_paid,
    'orderId', v_order.id,
    'orderNumber', v_order.order_number
  );
end;
$$;

create or replace function public.prepare_order_payment_retry(
  p_order_id uuid,
  p_hold_minutes integer default 60
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
begin
  select id, status, coupon_id into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;
  if v_order.status not in ('FAILED', 'PENDING_PAYMENT') then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_RETRYABLE';
  end if;

  update public.orders
  set status = 'PENDING_PAYMENT', updated_at = now()
  where id = p_order_id;

  perform public.reserve_order_inventory(p_order_id, p_hold_minutes);
  if v_order.coupon_id is not null then
    perform public.claim_order_coupon(p_order_id, p_hold_minutes);
  end if;
end;
$$;

revoke all on function public.process_stripe_checkout_event(text, text, text, text, text, integer, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.prepare_order_payment_retry(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.process_stripe_checkout_event(text, text, text, text, text, integer, text, jsonb)
  to service_role;
grant execute on function public.prepare_order_payment_retry(uuid, integer)
  to service_role;

-- Track asynchronous Stripe refund outcomes without marking pending refunds complete.

create or replace function public.attach_order_refund_provider(
  p_refund_id uuid,
  p_provider_refund_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.order_refunds
  set provider_refund_id = p_provider_refund_id, updated_at = now()
  where id = p_refund_id and status <> 'SUCCEEDED';
  if not found then
    if not exists (select 1 from public.order_refunds where id = p_refund_id and provider_refund_id = p_provider_refund_id) then
      raise exception using errcode = 'P0002', message = 'REFUND_NOT_FOUND';
    end if;
  end if;
end;
$$;

create or replace function public.process_stripe_refund_event(
  p_event_id text,
  p_event_type text,
  p_provider_refund_id text,
  p_refund_status text,
  p_failure_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund record;
  v_order_number text;
  v_result jsonb;
begin
  insert into public.processed_webhooks(provider_event_id, event_type)
  values (p_event_id, p_event_type)
  on conflict (provider_event_id) do nothing;
  if not found then return jsonb_build_object('processed', false); end if;

  select * into v_refund
  from public.order_refunds
  where provider_refund_id = p_provider_refund_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REFUND_NOT_FOUND';
  end if;
  select order_number into v_order_number from public.orders where id = v_refund.order_id;

  if p_refund_status = 'succeeded' then
    select public.complete_order_refund(v_refund.id, p_provider_refund_id) into v_result;
  elsif p_refund_status in ('failed', 'canceled') then
    perform public.fail_order_refund(v_refund.id, coalesce(p_failure_reason, p_refund_status));
  end if;
  return jsonb_build_object(
    'processed', true,
    'orderNumber', v_order_number,
    'status', p_refund_status,
    'result', coalesce(v_result, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.attach_order_refund_provider(uuid, text) from public, anon, authenticated;
revoke all on function public.process_stripe_refund_event(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.attach_order_refund_provider(uuid, text) to service_role;
grant execute on function public.process_stripe_refund_event(text, text, text, text, text) to service_role;

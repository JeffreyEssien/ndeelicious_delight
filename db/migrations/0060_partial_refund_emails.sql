-- Full refunds already email the customer when the order moves to REFUNDED. Partial refunds
-- leave the order where it is, so they sent nothing. Each one now queues a PARTIALLY_REFUNDED
-- email; a later partial refund re-arms the same row so the customer hears about every one.
alter table public.order_notifications drop constraint if exists order_notifications_event_type_check;
alter table public.order_notifications add constraint order_notifications_event_type_check check (event_type in (
  'ORDER_RECEIVED', 'PAID', 'CONFIRMED', 'PREPARING',
  'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'REFUNDED', 'PARTIALLY_REFUNDED'
));

create or replace function public.queue_partial_refund_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.refunded_amount > old.refunded_amount and new.refunded_amount < new.amount then
    insert into public.order_notifications(order_id, event_type, recipient)
    select o.id, 'PARTIALLY_REFUNDED', o.email from public.orders o where o.id = new.order_id
    on conflict (order_id, event_type, recipient) do update
      set status = 'PENDING', attempts = 0, last_error = null, sent_at = null,
          next_attempt_at = now(), updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists payments_partial_refund_notification on public.payments;
create trigger payments_partial_refund_notification
after update of refunded_amount on public.payments
for each row execute function public.queue_partial_refund_notification();

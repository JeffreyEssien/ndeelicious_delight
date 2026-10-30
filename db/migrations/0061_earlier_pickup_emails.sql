-- When the owner changes the pickup schedule, open pickup orders that can now be collected
-- sooner get an EARLIER_PICKUP email. The row is re-armed if a later change moves it again.
alter table public.order_notifications drop constraint if exists order_notifications_event_type_check;
alter table public.order_notifications add constraint order_notifications_event_type_check check (event_type in (
  'ORDER_RECEIVED', 'PAID', 'CONFIRMED', 'PREPARING',
  'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'EARLIER_PICKUP'
));

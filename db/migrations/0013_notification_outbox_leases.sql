-- Allow interrupted notification deliveries to be reclaimed after a short lease.

drop index if exists public.order_notifications_pending_idx;
create index order_notifications_pending_idx
  on public.order_notifications(status, next_attempt_at)
  where status in ('PENDING', 'FAILED', 'SENDING');

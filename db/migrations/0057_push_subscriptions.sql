-- Browser push subscriptions. An admin subscription receives store alerts; a customer
-- subscription receives updates for one order. Rows go with the admin or order they
-- belong to, and the sender deletes subscriptions the browser has revoked.
begin;
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  audience text not null check (audience in ('admin', 'customer')),
  admin_id uuid references public.admins(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  endpoint text not null check (endpoint like 'https://%' and char_length(endpoint) <= 2000),
  p256dh text not null check (char_length(p256dh) between 1 and 200),
  auth text not null check (char_length(auth) between 1 and 100),
  failure_count integer not null default 0,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (audience = 'admin' and admin_id is not null and order_id is null)
    or (audience = 'customer' and order_id is not null and admin_id is null)
  )
);
create unique index push_subscriptions_admin_endpoint_idx
  on public.push_subscriptions(endpoint, admin_id) where audience = 'admin';
create unique index push_subscriptions_order_endpoint_idx
  on public.push_subscriptions(endpoint, order_id) where audience = 'customer';
create index push_subscriptions_order_idx on public.push_subscriptions(order_id) where audience = 'customer';
alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon, authenticated;
grant all on table public.push_subscriptions to service_role;
commit;

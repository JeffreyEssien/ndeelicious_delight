-- Privacy-conscious first-party commerce analytics.

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (event_name in (
    'PRODUCT_VIEWED', 'ADD_TO_CART', 'REMOVE_FROM_CART', 'CHECKOUT_STARTED',
    'COUPON_APPLIED', 'SEARCH_PERFORMED', 'CAKE_BUILDER_STARTED', 'CAKE_BUILDER_COMPLETED'
  )),
  anonymous_id uuid not null,
  product_id uuid references public.products(id) on delete set null,
  path text not null check (char_length(path) between 1 and 300 and path like '/%'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (occurred_at <= created_at + interval '5 minutes'),
  check (occurred_at >= created_at - interval '7 days')
);

create index if not exists analytics_events_name_created_idx
  on public.analytics_events(event_name, created_at desc);
create index if not exists analytics_events_anonymous_created_idx
  on public.analytics_events(anonymous_id, created_at desc);
create index if not exists analytics_events_product_created_idx
  on public.analytics_events(product_id, created_at desc)
  where product_id is not null;

alter table public.analytics_events enable row level security;
revoke all on table public.analytics_events from public, anon, authenticated;
grant select, insert on table public.analytics_events to service_role;

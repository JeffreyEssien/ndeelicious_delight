-- Admin-managed sub-categories ("collections") that live under the three fixed groups
-- (Ready to order / Ready to bake / Custom cakes). Products and cakes can be tagged with one.
begin;
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  parent text not null check (parent in ('PASTRIES','READY_TO_BAKE','CUSTOM_CAKES')),
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.collections enable row level security;
create policy collections_public_read on public.collections for select using (active);
grant select on public.collections to anon, authenticated;
grant all on public.collections to service_role;
alter table public.products add column collection_id uuid references public.collections(id) on delete set null;
alter table public.cake_types add column collection_id uuid references public.collections(id) on delete set null;
commit;

-- The admin image library: photos the owner uploads to reuse across the website (page images,
-- banners, logos). Product and cake photos keep their own tables; the library lists those too.
-- Only the server (service role) reads or writes it, so there is no public policy.
begin;
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  url text not null check (url ~ '^https://'),
  storage_path text not null unique,
  title text not null default '' check (char_length(title) <= 120),
  alt_text text not null default '' check (char_length(alt_text) <= 300),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  bytes integer not null default 0 check (bytes >= 0),
  format text not null default '',
  created_by uuid references public.admins(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index media_assets_created_idx on public.media_assets(created_at desc);
alter table public.media_assets enable row level security;
grant all on public.media_assets to service_role;
commit;

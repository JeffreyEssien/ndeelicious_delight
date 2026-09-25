-- Multi-admin operational mail, fulfilled-order review invitations, and document support.

update public.site_settings
set value = value || jsonb_build_object('taxRegistrationNumber', coalesce(value ->> 'taxRegistrationNumber', '')),
    updated_at = now()
where key = 'business';

alter table public.orders add column if not exists delivered_at timestamptz;

update public.orders
set delivered_at = updated_at
where status = 'DELIVERED' and delivered_at is null;

create or replace function public.stamp_order_delivery()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'DELIVERED' and old.status is distinct from new.status and new.delivered_at is null then
    new.delivered_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_order_delivery on public.orders;
create trigger stamp_order_delivery
before update of status on public.orders
for each row execute function public.stamp_order_delivery();

alter table public.reviews add column if not exists order_id uuid references public.orders(id) on delete restrict;
alter table public.reviews add column if not exists order_item_id uuid references public.order_items(id) on delete restrict;
alter table public.reviews add column if not exists verified_purchase boolean not null default false;

create unique index if not exists reviews_verified_order_item_idx
  on public.reviews(order_item_id)
  where verified_purchase = true;

create table if not exists public.review_invitations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  recipient text not null,
  eligible_at timestamptz not null,
  expires_at timestamptz not null,
  sent_at timestamptz,
  used_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_item_id)
);

create index if not exists review_invitations_due_idx
  on public.review_invitations(eligible_at, sent_at, used_at);

create table if not exists public.admin_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('LOW_STOCK_DIGEST')),
  recipient text not null,
  reference_key text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'FAILED')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(kind, recipient, reference_key)
);

alter table public.review_invitations enable row level security;
alter table public.admin_email_deliveries enable row level security;
revoke all on table public.review_invitations, public.admin_email_deliveries from public, anon, authenticated;
grant select, insert, update, delete on table public.review_invitations to service_role;
grant select, insert, update on table public.admin_email_deliveries to service_role;

create or replace function public.submit_verified_review(
  p_invitation_id uuid,
  p_rating smallint,
  p_title text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation record;
  v_order record;
  v_review_id uuid;
begin
  if p_rating < 1 or p_rating > 5
     or char_length(trim(coalesce(p_title, ''))) not between 2 and 120
     or char_length(trim(coalesce(p_body, ''))) not between 10 and 2000 then
    raise exception using errcode = '22023', message = 'INVALID_REVIEW';
  end if;

  select * into v_invitation
  from public.review_invitations
  where id = p_invitation_id
  for update;

  if not found then raise exception using errcode = 'P0002', message = 'INVITATION_NOT_FOUND'; end if;
  if v_invitation.sent_at is null or v_invitation.eligible_at > now() or v_invitation.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'INVITATION_UNAVAILABLE';
  end if;
  if v_invitation.used_at is not null then
    raise exception using errcode = 'P0001', message = 'INVITATION_USED';
  end if;

  select id, customer_id, customer_name, status into v_order
  from public.orders
  where id = v_invitation.order_id;
  if not found or v_order.status <> 'DELIVERED' then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_DELIVERED';
  end if;

  insert into public.reviews(
    product_id, customer_id, customer_name, rating, title, body, status,
    order_id, order_item_id, verified_purchase
  ) values (
    v_invitation.product_id, v_order.customer_id, v_order.customer_name, p_rating,
    trim(p_title), trim(p_body), 'PENDING', v_order.id, v_invitation.order_item_id, true
  ) returning id into v_review_id;

  update public.review_invitations
  set used_at = now(), updated_at = now(), last_error = null
  where id = v_invitation.id;

  return v_review_id;
end;
$$;

revoke all on function public.submit_verified_review(uuid, smallint, text, text) from public, anon, authenticated;
grant execute on function public.submit_verified_review(uuid, smallint, text, text) to service_role;

-- Ndeeelicious Delight initial PostgreSQL schema.
-- Monetary values are integer kobo. Historical order records store snapshots.
create extension if not exists pgcrypto;

create type product_status as enum ('DRAFT','ACTIVE','OUT_OF_STOCK','ARCHIVED');
create type order_status as enum ('PENDING_PAYMENT','PAID','CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED','CANCELLED','REFUNDED','FAILED');
create type cake_status as enum ('DRAFT','QUOTE_REQUIRED','QUOTE_SENT','CUSTOMER_APPROVED','PENDING_PAYMENT','PAID','CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED','CANCELLED','REFUNDED');
create type payment_status as enum ('PENDING','SUCCEEDED','FAILED','REFUNDED','PARTIALLY_REFUNDED');
create type discount_type as enum ('PERCENTAGE','FIXED');
create type review_status as enum ('PENDING','APPROVED','REJECTED');

create table admins (
  id uuid primary key default gen_random_uuid(), email text not null unique,
  name text not null, role text not null default 'OWNER', password_hash text,
  active boolean not null default true, last_login_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table customers (
  id uuid primary key default gen_random_uuid(), email text not null unique,
  name text not null, phone text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table categories (
  id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
  description text, sort_order integer not null default 0, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table products (
  id uuid primary key default gen_random_uuid(), category_id uuid not null references categories(id),
  name text not null, slug text not null unique, short_description text not null, description text not null,
  base_price integer not null check (base_price >= 0), discount_price integer check (discount_price >= 0),
  sku text unique, status product_status not null default 'DRAFT', featured boolean not null default false,
  track_inventory boolean not null default true, stock_quantity integer not null default 0 check(stock_quantity >= 0),
  low_stock_threshold integer not null default 5 check(low_stock_threshold >= 0), ingredients text,
  allergens text[] not null default '{}', storage_instructions text, preparation_instructions text,
  seo_title text, seo_description text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table product_variants (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references products(id),
  name text not null, sku text unique, attributes jsonb not null default '{}', price_adjustment integer not null default 0,
  stock_quantity integer not null default 0 check(stock_quantity >= 0), active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table product_images (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references products(id) on delete cascade,
  url text not null, alt_text text not null, sort_order integer not null default 0, created_at timestamptz not null default now()
);
create table custom_cake_options (
  id uuid primary key default gen_random_uuid(), type text not null, name text not null, description text,
  price_adjustment integer not null default 0, attributes jsonb not null default '{}',
  quote_required boolean not null default false, active boolean not null default true, sort_order integer not null default 0
);
create table delivery_zones (
  id uuid primary key default gen_random_uuid(), name text not null unique, fee integer not null check(fee >= 0),
  estimated_time text, minimum_order integer not null default 0, active boolean not null default true,
  sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table delivery_addresses (
  id uuid primary key default gen_random_uuid(), customer_id uuid references customers(id), name text not null,
  phone text not null, street text not null, area text, city text not null, state text not null,
  instructions text, created_at timestamptz not null default now()
);
create table carts (
  id uuid primary key default gen_random_uuid(), customer_id uuid references customers(id), session_id text unique,
  expires_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table cart_items (
  id uuid primary key default gen_random_uuid(), cart_id uuid not null references carts(id) on delete cascade,
  product_id uuid not null references products(id), variant_id uuid references product_variants(id),
  quantity integer not null check(quantity > 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(cart_id, product_id, variant_id)
);
create table coupons (
  id uuid primary key default gen_random_uuid(), code text not null unique, type discount_type not null,
  value integer not null check(value > 0), minimum_order integer not null default 0, maximum_discount integer,
  starts_at timestamptz, expires_at timestamptz, usage_limit integer, per_customer_limit integer,
  active boolean not null default true, product_ids uuid[] not null default '{}', category_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table orders (
  id uuid primary key default gen_random_uuid(), order_number text not null unique,
  customer_id uuid references customers(id), customer_name text not null, email text not null, phone text not null,
  status order_status not null default 'PENDING_PAYMENT', fulfilment text not null check(fulfilment in ('delivery','pickup')),
  delivery_zone_id uuid references delivery_zones(id), delivery_address_snapshot jsonb,
  subtotal integer not null, discount_total integer not null default 0, delivery_fee integer not null default 0,
  grand_total integer not null, coupon_id uuid references coupons(id), currency char(3) not null default 'NGN',
  customer_note text, internal_note text, inventory_deducted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id),
  product_id uuid references products(id), variant_id uuid references product_variants(id),
  product_name text not null, variant_name text, sku text, unit_price integer not null,
  quantity integer not null check(quantity > 0), discount integer not null default 0, final_price integer not null,
  product_snapshot jsonb not null default '{}'
);
create table custom_cake_orders (
  id uuid primary key default gen_random_uuid(), request_number text not null unique, order_id uuid references orders(id),
  customer_id uuid references customers(id), customer_name text not null, email text not null, phone text not null,
  status cake_status not null default 'QUOTE_REQUIRED', configuration jsonb not null,
  requested_date date not null, estimated_total integer, quoted_total integer, quote_expires_at timestamptz,
  reference_urls text[] not null default '{}', customer_note text, internal_note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table payments (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id),
  provider text not null default 'stripe', provider_payment_id text not null unique,
  status payment_status not null default 'PENDING', amount integer not null, currency char(3) not null default 'NGN',
  idempotency_key text unique, provider_payload jsonb not null default '{}', paid_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table coupon_usages (
  id uuid primary key default gen_random_uuid(), coupon_id uuid not null references coupons(id),
  order_id uuid not null references orders(id), customer_id uuid references customers(id),
  discount_amount integer not null, created_at timestamptz not null default now(), unique(coupon_id, order_id)
);
create table reviews (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references products(id),
  customer_id uuid references customers(id), customer_name text not null, rating smallint not null check(rating between 1 and 5),
  title text, body text not null, status review_status not null default 'PENDING', created_at timestamptz not null default now()
);
create table contact_messages (
  id uuid primary key default gen_random_uuid(), name text not null, email text not null, phone text,
  subject text not null, message text not null, resolved_at timestamptz, created_at timestamptz not null default now()
);
create table newsletter_subscribers (
  id uuid primary key default gen_random_uuid(), email text not null unique, active boolean not null default true,
  subscribed_at timestamptz not null default now(), unsubscribed_at timestamptz
);
create table site_settings (
  key text primary key, value jsonb not null, updated_by uuid references admins(id), updated_at timestamptz not null default now()
);
create table audit_logs (
  id uuid primary key default gen_random_uuid(), admin_id uuid references admins(id), action text not null,
  entity text not null, entity_id text, previous_value jsonb, new_value jsonb,
  ip_address inet, created_at timestamptz not null default now()
);
create table processed_webhooks (
  provider_event_id text primary key, event_type text not null, processed_at timestamptz not null default now()
);

create index products_category_status_idx on products(category_id,status);
create index orders_status_created_idx on orders(status,created_at desc);
create index orders_customer_idx on orders(customer_id);
create index cake_orders_status_date_idx on custom_cake_orders(status,requested_date);
create index audit_logs_entity_idx on audit_logs(entity,entity_id,created_at desc);

insert into categories(name,slug,sort_order) values
  ('Custom Cakes','custom-cakes',1),('Fresh Pastries','pastries',2),('Ready to Bake','ready-to-bake',3);

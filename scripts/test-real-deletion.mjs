import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
// Runs every migration in order, then checks that deleting a product or a delivery area
// removes it for good while past orders keep their own copies.
const db = new PGlite();
const dir = new URL("../db/migrations/", import.meta.url);
await db.exec(`create role anon; create role authenticated; create role service_role; create role supabase_storage_admin;
create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql as 'select null::uuid';
create function auth.role() returns text language sql as 'select null::text';
create function auth.jwt() returns jsonb language sql as 'select null::jsonb';
create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb);
create function storage.foldername(text) returns text[] language sql as 'select string_to_array($1,''/'')';`);
for (const name of fs
  .readdirSync(dir)
  .filter((file) => file.endsWith(".sql"))
  .sort())
  await db.exec(fs.readFileSync(new URL(name, dir), "utf8").replace(/create extension[^;]*;/gi, ""));

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const count = async (sql, params = []) => Number((await one(sql, params)).count);
const admin = await one("insert into admins(email,name) values('owner@example.test','Owner') returning id");
const session = await one(
  "insert into admin_sessions(admin_id,token_hash,expires_at) values($1,'t',now()+interval '1 day') returning id",
  [admin.id],
);
const category = await one("insert into categories(name,slug) values('Pies','pies') returning id");
async function product(slug) {
  const row = await one(
    "insert into products(category_id,name,slug,short_description,description,base_price,status) values($1,$2,$2,'Pie','Pie',1200,'DRAFT') returning id",
    [category.id, slug],
  );
  const variant = await one(
    "insert into product_variants(product_id,name,stock_quantity,pack_quantity) values($1,'Box of 6',10,6) returning id",
    [row.id],
  );
  // Published like a live shop product, so the delete runs past the pack-publishing checks.
  await db.query("update products set status='ACTIVE' where id=$1", [row.id]);
  return { id: row.id, variant: variant.id };
}
const pie = await product("meat-pie");
assert.equal((await one("select status from products where id=$1", [pie.id])).status, "ACTIVE");
const zone = await one(
  "insert into delivery_zones(name,fee,minimum_order,active,postal_code_prefixes) values('Halifax',800,0,true,array['B3H']) returning id",
);
const order = await one(
  "insert into orders(order_number,customer_name,email,phone,fulfilment,delivery_zone_id,subtotal,grand_total,currency) values('ND-1','Ada','ada@example.test','9025550100','delivery',$1,1200,2000,'CAD') returning id",
  [zone.id],
);
const item = await one(
  "insert into order_items(order_id,product_id,variant_id,product_name,variant_name,unit_price,quantity,final_price) values($1,$2,$3,'Meat pie','Box of 6',1200,1,1200) returning id",
  [order.id, pie.id, pie.variant],
);
await db.query(
  "insert into inventory_reservations(order_id,order_item_id,product_id,variant_id,quantity,status,expires_at) values($1,$2,$3,$4,1,'COMMITTED',now()-interval '1 day')",
  [order.id, item.id, pie.id, pie.variant],
);
await db.query("insert into product_images(product_id,url,alt_text) values($1,'/pie.jpg','Pie')", [pie.id]);
await db.query(
  "insert into reviews(product_id,customer_name,rating,body,status) values($1,'Ada',5,'Lovely','APPROVED')",
  [pie.id],
);
await db.query(
  "insert into review_invitations(order_id,order_item_id,product_id,recipient,eligible_at,expires_at) values($1,$2,$3,'ada@example.test',now(),now()+interval '30 days')",
  [order.id, item.id, pie.id],
);
const cart = await one("insert into carts(session_id) values('s1') returning id");
await db.query("insert into cart_items(cart_id,product_id,variant_id,quantity) values($1,$2,$3,1)", [
  cart.id,
  pie.id,
  pie.variant,
]);
const coupon = await one(
  "insert into coupons(code,type,value,product_ids) values('PIE10','PERCENTAGE',10,array[$1]::uuid[]) returning id",
  [pie.id],
);

await db.query("select admin_delete_product($1,$2,$3)", [pie.id, admin.id, session.id]);
assert.equal(await count("select count(*) from products where id=$1", [pie.id]), 0);
for (const table of ["product_variants", "product_images", "reviews", "review_invitations", "cart_items"])
  assert.equal(await count(`select count(*) from ${table} where product_id=$1`, [pie.id]), 0, table);
const kept = await one(
  "select product_id,variant_id,product_name,variant_name,final_price from order_items where id=$1",
  [item.id],
);
assert.deepEqual(kept, {
  product_id: null,
  variant_id: null,
  product_name: "Meat pie",
  variant_name: "Box of 6",
  final_price: 1200,
});
const hold = await one("select product_id,variant_id,status from inventory_reservations where order_item_id=$1", [
  item.id,
]);
assert.deepEqual(hold, { product_id: null, variant_id: null, status: "COMMITTED" });
assert.deepEqual((await one("select product_ids from coupons where id=$1", [coupon.id])).product_ids, []);
const audit = await one(
  "select action,previous_value->>'name' as name from admin_audit_logs where entity_type='product' and entity_id=$1",
  [pie.id],
);
assert.deepEqual(audit, { action: "PRODUCT_DELETED", name: "meat-pie" });
await assert.rejects(
  db.query("select admin_delete_product($1,$2,$3)", [pie.id, admin.id, session.id]),
  /PRODUCT_NOT_FOUND/,
);

// Stock held for a checkout that is still being paid blocks the delete.
const roll = await product("sausage-roll");
const pending = await one(
  "insert into orders(order_number,customer_name,email,phone,fulfilment,subtotal,grand_total,currency) values('ND-2','Ola','ola@example.test','9025550101','pickup',900,900,'CAD') returning id",
);
const pendingItem = await one(
  "insert into order_items(order_id,product_id,variant_id,product_name,unit_price,quantity,final_price) values($1,$2,$3,'Sausage roll',900,1,900) returning id",
  [pending.id, roll.id, roll.variant],
);
await db.query(
  "insert into inventory_reservations(order_id,order_item_id,product_id,variant_id,quantity,status,expires_at) values($1,$2,$3,$4,1,'ACTIVE',now()+interval '10 minutes')",
  [pending.id, pendingItem.id, roll.id, roll.variant],
);
await assert.rejects(
  db.query("select admin_delete_product($1,$2,$3)", [roll.id, admin.id, session.id]),
  /PRODUCT_IN_CHECKOUT/,
);
assert.equal(await count("select count(*) from products where id=$1", [roll.id]), 1);

// A delivery area left out of the saved list is deleted; its orders keep everything else.
const keep = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Dartmouth",
  fee: 1200,
  minimumOrder: 0,
  estimate: "",
  active: true,
  postalCodePrefixes: ["B2W"],
  freeDeliveryThreshold: null,
  customerNote: "",
  sameDayEligible: false,
  sortOrder: 0,
};
await db.query("select save_delivery_areas($1::jsonb)", [JSON.stringify([keep])]);
assert.equal(await count("select count(*) from delivery_zones where id=$1", [zone.id]), 0);
assert.equal(await count("select count(*) from delivery_zones where id=$1", [keep.id]), 1);
assert.deepEqual(await one("select delivery_zone_id,delivery_fee,grand_total from orders where id=$1", [order.id]), {
  delivery_zone_id: null,
  delivery_fee: 0,
  grand_total: 2000,
});
console.log(
  "PASS product delete cascades its own data, keeps order lines and stock history, clears coupons, audits, blocks live checkouts; removed delivery areas are deleted and orders kept",
);

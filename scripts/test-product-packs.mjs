import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const db = new PGlite();
const migration = (name) =>
  fs
    .readFileSync(new URL(`../db/migrations/${name}`, import.meta.url), "utf8")
    .replace("create extension if not exists pgcrypto;", "");
await db.exec("create role anon;create role authenticated;create role service_role;");
for (const name of [
  "0001_initial.sql",
  "0004_admin_otp_sessions.sql",
  "0005_inventory_integrity.sql",
  "0011_canada_commerce_settings.sql",
  "0012_order_lifecycle.sql",
  "0016_admin_audit_logs.sql",
  "0017_inventory_unit_skus.sql",
  "0024_persisted_business_documents.sql",
  "0030_cake_types.sql",
  "0031_product_shopping_modes.sql",
  "0032_commerce_configuration.sql",
  "0039_product_preparation_minutes.sql",
])
  await db.exec(migration(name));
await db.exec("alter table product_images add column storage_path text");
await db.exec(`insert into products(category_id,name,slug,short_description,description,base_price,status,shopping_mode,track_inventory)
 select id,'Legacy made to order','legacy-made','Legacy','Legacy',100,'ACTIVE','MADE_TO_ORDER',true from categories limit 1;
 insert into product_variants(product_id,name,price_adjustment,stock_quantity,active) select id,'Old standard',0,4,true from products where slug='legacy-made';
 insert into orders(order_number,customer_name,email,phone,fulfilment,subtotal,grand_total,status) values('LEGACY-PAID','Buyer','legacy@example.test','555','pickup',200,200,'PAID');
 insert into order_items(order_id,product_id,variant_id,product_name,variant_name,unit_price,quantity,final_price,product_snapshot)
 select o.id,p.id,v.id,p.name,v.name,100,2,200,'{"quantity":2,"inventoryTracked":true}' from orders o,products p join product_variants v on v.product_id=p.id where o.order_number='LEGACY-PAID' and p.slug='legacy-made';
 insert into inventory_reservations(order_id,order_item_id,product_id,variant_id,quantity,status,expires_at)
 select order_id,id,product_id,variant_id,quantity,'ACTIVE',now()+interval '1 hour' from order_items where product_name='Legacy made to order';`);
await db.exec(migration("0041_dynamic_product_packs.sql"));
await db.query("select commit_order_inventory('LEGACY-PAID')");
await db.query("select release_order_inventory('LEGACY-PAID')");
const legacy = (
  await db.query(
    "select v.pack_quantity,v.stock_quantity,v.active,v.retired_at from product_variants v join products p on p.id=v.product_id where p.slug='legacy-made'",
  )
).rows[0];
assert.equal(legacy.pack_quantity, null);
assert.equal(legacy.stock_quantity, 4);
assert.equal(legacy.active, true);
assert.equal(legacy.retired_at, null);

const actor = (await db.query("insert into admins(email,name) values('owner@example.test','Owner') returning id"))
  .rows[0];
const session = (
  await db.query(
    "insert into admin_sessions(admin_id,token_hash,expires_at) values($1,'packs',now()+interval '1 day') returning id",
    [actor.id],
  )
).rows[0];
const category = (
  await db.query(
    "insert into categories(name,slug) values('Pastries','pastries') on conflict(slug) do update set name=excluded.name returning id",
  )
).rows[0];
const base = {
  category_id: category.id,
  name: "Dynamic packs",
  slug: "dynamic-packs",
  short_description: "Prepared for you",
  description: "Any size",
  base_price: 1000,
  discount_price: 800,
  status: "ACTIVE",
  featured: false,
  track_inventory: true,
  low_stock_threshold: 3,
  allergens: [],
  shopping_mode: "MADE_TO_ORDER",
  tax_class: "SWEET_SINGLE_SERVING",
  preparation_hours: 0.75,
};
let packs = [3, 5, 8, 15].map((size, index) => ({
  id: randomUUID(),
  name: `Box of ${size}`,
  packQuantity: size,
  priceAdjustment: [1200, 1900, 2700, 4800][index] - 800,
  stockQuantity: index === 2 ? 4 : 0,
  trackInventory: index === 2,
  active: true,
  sortOrder: index,
}));
async function save(id, product = base, variants = packs) {
  return (
    await db.query("select admin_save_product($1,$2,$3,'[]',$4,$5) id", [
      id,
      JSON.stringify(product),
      JSON.stringify(variants),
      actor.id,
      session.id,
    ])
  ).rows[0].id;
}
const productId = await save(null);
async function rows() {
  return (
    await db.query("select * from product_variants where product_id=$1 and retired_at is null order by sort_order,id", [
      productId,
    ])
  ).rows;
}
assert.deepEqual(
  (await rows()).map((v) => v.pack_quantity),
  [3, 5, 8, 15],
);
assert.ok((await rows()).every((v) => v.sku.startsWith("NDE-")));
assert.equal((await db.query("select status from products where id=$1", [productId])).rows[0].status, "ACTIVE");
await save(productId);
assert.equal((await rows()).length, 4, "repeat saves reuse stable IDs");
const oldPrice = packs.map((v) => 800 + v.priceAdjustment);
const changed = { ...base, base_price: 2500, discount_price: 1500 };
packs = packs.map((v, i) => ({ ...v, priceAdjustment: oldPrice[i] - 1500 }));
await save(productId, changed);
assert.deepEqual(
  (await rows()).map((v) => 1500 + v.price_adjustment),
  oldPrice,
);
await assert.rejects(save(productId, { ...changed, status: "ACTIVE" }, []), /PUBLISHED_PACK_REQUIRED/);
await assert.rejects(
  save(productId, changed, [...packs, { ...packs[0], id: randomUUID() }]),
  /DUPLICATE_ACTIVE_PACK_SIZE/,
);
await assert.rejects(save(productId, changed, [{ ...packs[0], packQuantity: null }]), /COMPLETE_PUBLISHED_PACKS/);
assert.equal((await rows()).length, 4, "failed validation rolls back");
const another = await save(null, { ...changed, slug: "other" }, [{ ...packs[0], id: randomUUID() }]);
await assert.rejects(save(another, { ...changed, slug: "other" }, [packs[0]]), /VARIANT_OWNERSHIP/);
const zeroDraft = await save(null, { ...changed, slug: "empty", status: "DRAFT" }, []);
assert.ok(zeroDraft);
await assert.rejects(
  db.query("update products set status='ACTIVE' where id=$1", [zeroDraft]),
  /COMPLETE_PUBLISHED_PACKS/,
);
assert.equal((await db.query("select status from products where id=$1", [zeroDraft])).rows[0].status, "DRAFT");
async function order(number, variant, count = 2) {
  const o = (
    await db.query(
      "insert into orders(order_number,customer_name,email,phone,fulfilment,subtotal,grand_total) values($1,'Buyer','buyer@example.test','555','pickup',$2,$2) returning id",
      [number, (1500 + variant.priceAdjustment) * count],
    )
  ).rows[0];
  const snapshot = {
    variantName: variant.name,
    packQuantity: variant.packQuantity,
    quantity: count,
    totalPieces: variant.packQuantity * count,
    unitPrice: 1500 + variant.priceAdjustment,
    inventoryTracked: variant.trackInventory,
  };
  await db.query(
    "insert into order_items(order_id,product_id,variant_id,product_name,variant_name,unit_price,quantity,final_price,product_snapshot) values($1,$2,$3,'Dynamic packs',$4,$5,$6,$7,$8)",
    [
      o.id,
      productId,
      variant.id,
      variant.name,
      snapshot.unitPrice,
      count,
      snapshot.unitPrice * count,
      JSON.stringify(snapshot),
    ],
  );
  return o;
}
const tracked = await order("PACK-8", packs[2]);
await db.query("select reserve_order_inventory($1,60)", [tracked.id]);
assert.equal(
  (await db.query("select product_pack_availability(array[$1::uuid]) available", [productId])).rows[0].available[
    packs[2].id
  ],
  2,
);
const competing = await order("COMPETING", packs[2], 3);
await assert.rejects(db.query("select reserve_order_inventory($1,60)", [competing.id]), /INSUFFICIENT_STOCK/);
await assert.rejects(
  save(
    productId,
    changed,
    packs.map((v, i) => (i === 2 ? { ...v, stockQuantity: 1, expectedStockQuantity: 4 } : v)),
  ),
  /STOCK_BELOW_RESERVED/,
);
await assert.rejects(
  save(
    productId,
    changed,
    packs.map((v, i) => (i === 2 ? { ...v, expectedStockQuantity: 3 } : v)),
  ),
  /INVENTORY_CHANGED/,
);
assert.equal((await rows())[2].stock_quantity, 4);
const untracked = await order("UNTRACKED", packs[0], 2);
await db.query("select reserve_order_inventory($1,60)", [untracked.id]);
assert.equal(
  (await db.query("select count(*)::int n from inventory_reservations where order_id=$1", [untracked.id])).rows[0].n,
  0,
);
await db.query("select commit_order_inventory('UNTRACKED')");
// Retiring a reserved pack leaves its historical ID and reservation intact.
const retiredId = packs[2].id;
packs = packs
  .filter((v) => v.id !== retiredId)
  .reverse()
  .map((v, i) => ({ ...v, sortOrder: i, name: i === 0 ? "Celebration box" : v.name }));
await save(productId, changed);
await db.query("select commit_order_inventory('PACK-8')");
assert.equal(
  (await db.query("select stock_quantity from product_variants where id=$1", [retiredId])).rows[0].stock_quantity,
  2,
);
const history = (await db.query("select product_snapshot from order_items where order_id=$1", [tracked.id])).rows[0]
  .product_snapshot;
assert.equal(history.totalPieces, 16);
assert.equal(history.variantName, "Box of 8");
assert.equal(history.unitPrice, 2700);
await db.query("select release_order_inventory('PACK-8')");
assert.equal(
  (await db.query("select stock_quantity from product_variants where id=$1", [retiredId])).rows[0].stock_quantity,
  4,
);
const retired = (await db.query("select active,retired_at from product_variants where id=$1", [retiredId])).rows[0];
assert.equal(retired.active, false);
assert.ok(retired.retired_at);
await assert.rejects(
  save(productId, changed, [
    ...packs,
    {
      id: retiredId,
      name: "Again",
      packQuantity: 8,
      priceAdjustment: 1200,
      stockQuantity: 4,
      active: true,
      sortOrder: 4,
    },
  ]),
  /VARIANT_OWNERSHIP/,
);
const disabled = { ...packs[0], active: false };
await save(productId, changed, [disabled, ...packs.slice(1)]);
assert.equal((await rows())[0].active, false);
await save(productId, changed, packs);
assert.equal((await rows())[0].active, true);
await db.query(
  "insert into product_images(product_id,url,alt_text,sort_order) values($1,'/pastries.jpg','Pack photo',0)",
  [productId],
);
const copy = (await db.query("select admin_duplicate_product($1,$2,$3) id", [productId, actor.id, session.id])).rows[0]
  .id;
assert.equal((await db.query("select status,featured from products where id=$1", [copy])).rows[0].status, "DRAFT");
assert.equal((await db.query("select count(*)::int n from product_variants where product_id=$1", [copy])).rows[0].n, 3);
assert.equal((await db.query("select count(*)::int n from product_images where product_id=$1", [copy])).rows[0].n, 1);
const trackedOverride = {
  id: randomUUID(),
  name: "Tracked box",
  packQuantity: 7,
  priceAdjustment: 500,
  stockQuantity: 1,
  trackInventory: true,
  active: true,
  sortOrder: 0,
};
const overrideId = await save(
  null,
  { ...changed, name: "Override", slug: "tracked-override", track_inventory: false },
  [trackedOverride],
);
const inventoryPage = (
  await db.query("select admin_inventory_page($1) value", [JSON.stringify({ category: "ATTENTION" })])
).rows[0].value;
assert.ok(inventoryPage.ids.includes(overrideId));
assert.ok((await db.query("select admin_dashboard_summary() value")).rows[0].value.lowStockProducts >= 1);
for (const mode of ["READY_TO_ORDER", "READY_TO_BAKE"]) {
  const v = {
    id: randomUUID(),
    name: "Standard",
    packQuantity: null,
    priceAdjustment: 0,
    stockQuantity: 6,
    trackInventory: null,
    active: true,
    sortOrder: 0,
  };
  const id = await save(
    null,
    { ...changed, name: mode, slug: mode.toLowerCase().replaceAll("_", "-"), shopping_mode: mode },
    [v],
  );
  const o = (
    await db.query(
      "insert into orders(order_number,customer_name,email,phone,fulfilment,subtotal,grand_total) values($1,'Buyer','ready@example.test','555','pickup',3000,3000) returning id",
      [mode],
    )
  ).rows[0];
  await db.query(
    "insert into order_items(order_id,product_id,variant_id,product_name,unit_price,quantity,final_price) values($1,$2,$3,$4,1500,2,3000)",
    [o.id, id, v.id, mode],
  );
  await db.query("select reserve_order_inventory($1,60)", [o.id]);
  await db.query("select commit_order_inventory($1)", [mode]);
  assert.equal(
    (await db.query("select stock_quantity from product_variants where id=$1", [v.id])).rows[0].stock_quantity,
    4,
  );
  await db.query("select release_order_inventory($1)", [mode]);
  assert.equal(
    (await db.query("select stock_quantity,status from products where id=$1", [id])).rows[0].stock_quantity,
    6,
  );
}
await db.exec("set role anon");
await assert.rejects(save(productId), /permission denied/);
console.log(
  "PASS dynamic packs: arbitrary sizes/prices, stable save IDs, base/sale edits, validation rollback, ownership, drafts, tracked/untracked reservations, stale stock, retire/fulfil/refund, historical 16-piece snapshot, reorder/rename/disable/re-enable, atomic duplication, service-only writes",
);
await db.close();

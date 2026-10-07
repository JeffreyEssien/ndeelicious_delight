import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const read = (name) => fs.readFileSync(new URL(`../db/migrations/${name}`, import.meta.url), "utf8");
await db.exec("create role anon; create role authenticated; create role service_role;");
await db.exec(read("0001_initial.sql").replace("create extension if not exists pgcrypto;", ""));
await db.exec(
  "alter table orders add column tax_total integer not null default 0, add column tax_rate_bps integer not null default 0;",
);
await db.exec("insert into site_settings(key,value) values('business','{\"timezone\":\"America/Halifax\"}');");
for (const name of ["0030_cake_types.sql", "0031_product_shopping_modes.sql", "0032_commerce_configuration.sql"]) {
  await db.exec(read(name));
  console.log(`PASS ${name}`);
}
const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
await db.query(
  "insert into delivery_zones(id,name,fee,minimum_order,active,postal_code_prefixes) values($1,'A',100,0,true,array['B3H'])",
  [id],
);
await assert.rejects(
  db.query(
    "insert into delivery_zones(id,name,fee,minimum_order,active,postal_code_prefixes) values($1,'B',100,0,true,array['B3H'])",
    [other],
  ),
  /Overlapping/,
);
await assert.rejects(
  db.query("update delivery_zones set postal_code_prefixes=array['M5V'] where id=$1", [id]),
  /Invalid/,
);
await assert.rejects(
  db.query("update delivery_zones set postal_code_prefixes=array['B3H','B3H'] where id=$1", [id]),
  /Duplicate/,
);
await assert.rejects(
  db.query("update delivery_zones set free_delivery_threshold=-1 where id=$1", [id]),
  /check constraint/,
);
const area = {
  id,
  name: "A",
  fee: 200,
  minimumOrder: 0,
  estimate: "",
  active: true,
  postalCodePrefixes: ["B3H"],
  freeDeliveryThreshold: 500,
  customerNote: "",
  sameDayEligible: false,
  sortOrder: 0,
};
await assert.rejects(
  db.query("select save_delivery_areas($1::jsonb)", [JSON.stringify([area, { ...area, id: other }])]),
  /Overlapping/,
);
assert.equal((await db.query("select fee from delivery_zones where id=$1", [id])).rows[0].fee, 100);
await db.query("select save_delivery_areas($1::jsonb)", [JSON.stringify([area])]);
assert.equal((await db.query("select fee from delivery_zones where id=$1", [id])).rows[0].fee, 200);
const cakeType = {
  id,
  name: "Cake",
  slug: "cake",
  description: "",
  basePrice: 2500,
  taxClass: "FULL_CAKE",
  leadTimeValue: 1,
  leadTimeUnit: "weeks",
  active: true,
  sortOrder: 0,
  image: "",
  customerNotice: "",
};
await db.query("select save_cake_configuration($1::jsonb,$2::jsonb)", [JSON.stringify([cakeType]), "[]"]);
await db.query(
  "insert into custom_cake_options(id,type,name,price_adjustment,active) values($1,'size','Small',500,true)",
  [other],
);
await db.query("select save_cake_option_assignments($1,array[$2]::uuid[])", [id, other]);
await assert.rejects(
  db.query("select save_cake_configuration($1::jsonb,$2::jsonb)", [
    JSON.stringify([{ ...cakeType, basePrice: 9999 }]),
    JSON.stringify([{ cakeTypeId: id, optionId: "33333333-3333-4333-8333-333333333333" }]),
  ]),
  /foreign key/,
);
assert.equal((await db.query("select base_price from cake_types where id=$1", [id])).rows[0].base_price, 2500);
await db.exec(read("0024_persisted_business_documents.sql").split("create or replace function")[0]);
// Supply the historical function and relation column that the additive replacement extends.
await db.exec(
  "create function create_order_from_accepted_quote(text,text,uuid,jsonb) returns jsonb language sql as 'select null::jsonb';",
);
await db.exec(read("0033_quote_commerce_snapshots.sql"));
console.log(
  "PASS postal overlap, prefix validity, fee constraints, atomic delivery save, relationship FK, atomic cake save, quote RPC DDL and grants",
);
const cake = (
  await db.query(
    "insert into custom_cake_orders(request_number,cake_type_id,requested_date,configuration,customer_name,email,phone) values('TEST-CAKE',$1,current_date+60,'{}','Fixture','fixture@example.invalid','0000000000') returning id",
    [id],
  )
).rows[0];
const document = (
  await db.query(
    `insert into business_documents(kind,number,state,cake_order_id,business_snapshot,customer_snapshot,line_items_snapshot,totals_snapshot,branding_snapshot)
 values('QUOTE','TEST-QUOTE','ACCEPTED',$1,'{"currency":"CAD"}','{}','[{"name":"Cake","detail":"Small"}]','{"total":2500}','{}') returning id`,
    [cake.id],
  )
).rows[0];
const token = "a".repeat(64);
await db.query(
  "insert into document_access_tokens(document_id,token_hash,expires_at) values($1,$2,now()+interval '1 day')",
  [document.id, token],
);
const pricing = {
  subtotal: 2500,
  deliveryFee: 0,
  taxTotal: 0,
  grandTotal: 2500,
  taxSnapshot: { jurisdiction: "CA-NS", total: 0, lines: [{ taxClass: "FULL_CAKE", rateBps: 0, taxAmount: 0 }] },
  fulfilment: { earliestAt: new Date(Date.now() + 168 * 3600000).toISOString() },
};
const converted = (
  await db.query("select create_order_from_accepted_quote_v2($1,'pickup',null,null,$2::jsonb) as result", [
    token,
    JSON.stringify(pricing),
  ])
).rows[0].result;
const repeated = (
  await db.query("select create_order_from_accepted_quote_v2($1,'pickup',null,null,$2::jsonb) as result", [
    token,
    JSON.stringify({ ...pricing, grandTotal: 9999 }),
  ])
).rows[0].result;
assert.equal(converted.orderId, repeated.orderId);
assert.equal(repeated.total, 2500);
await assert.rejects(db.query("update orders set tax_snapshot='{}' where id=$1", [converted.orderId]), /immutable/);
await db.query("update orders set status='REFUNDED' where id=$1", [converted.orderId]);
assert.equal(
  (await db.query("select tax_snapshot from orders where id=$1", [converted.orderId])).rows[0].tax_snapshot.lines[0]
    .taxClass,
  "FULL_CAKE",
);
console.log("PASS accepted quote conversion, idempotent repeat, immutable tax snapshots and refund status retention");

await db.close();

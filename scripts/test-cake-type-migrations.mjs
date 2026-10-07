// Verifies the new migrations against the columns they extend in isolated PostgreSQL.
// No environment files, credentials or network database connection are used.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;
 create table site_settings(key text primary key,value jsonb);
 insert into site_settings values ('business','{"timezone":"America/Halifax"}');
 create table custom_cake_orders(id uuid primary key default gen_random_uuid(),requested_date date not null,configuration jsonb);
 create table categories(id uuid primary key,slug text);
 create table products(id uuid primary key,category_id uuid);
 create table orders(id uuid primary key default gen_random_uuid(),status text);
`);
const root = new URL("../", import.meta.url);
for (const file of ["0030_cake_types.sql", "0031_product_shopping_modes.sql"]) {
  await db.exec(fs.readFileSync(new URL(`db/migrations/${file}`, root), "utf8"));
  console.log(`PASS migration ${file}`);
}
const type = "11111111-1111-4111-8111-111111111111";
await db.query(
  "insert into cake_types(id,name,slug,lead_time_value,lead_time_unit,active) values ($1,'Wedding Cake','wedding',3,'weeks',true)",
  [type],
);
await assert.rejects(db.query("update cake_types set lead_time_value=0 where id=$1", [type]), /check constraint/);
console.log("PASS active type requires lead time");
await assert.rejects(
  db.query("insert into custom_cake_orders(cake_type_id,requested_date) values ($1,current_date)", [type]),
  /preparation/,
);
console.log("PASS invalid requested date rejected");
const { rows } = await db.query(
  "insert into custom_cake_orders(cake_type_id,requested_date) values ($1,current_date+60) returning id,lead_time_snapshot",
  [type],
);
assert.equal(rows[0].lead_time_snapshot.leadTimeValue, 3);
await db.query("update cake_types set lead_time_value=4 where id=$1", [type]);
const saved = (await db.query("select lead_time_snapshot from custom_cake_orders where id=$1", [rows[0].id])).rows[0];
assert.equal(saved.lead_time_snapshot.leadTimeValue, 3);
console.log("PASS existing snapshot retained after configuration change");
await assert.rejects(
  db.query("update custom_cake_orders set lead_time_snapshot='{}' where id=$1", [rows[0].id]),
  /immutable/,
);
console.log("PASS submitted snapshot immutable");
await db.query("update cake_types set active=false where id=$1", [type]);
await assert.rejects(
  db.query("insert into custom_cake_orders(cake_type_id,requested_date) values ($1,current_date+60)", [type]),
  /active cake/,
);
console.log("PASS disabled type rejected");
const order = (
  await db.query(
    "insert into orders(status,preparation_ready_at) values ('PREPARING',now()+interval '48 hours') returning id",
  )
).rows[0];
await assert.rejects(
  db.query("update orders set status='READY' where id=$1", [order.id]),
  /PRODUCT_PREPARATION_PENDING/,
);
console.log("PASS product preparation window enforced");
await db.close();

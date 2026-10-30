import assert from "node:assert/strict";
import { migratedDatabase } from "./all-migrations.mjs";
// Push subscriptions: who they belong to, one per browser and owner, and cleanup when the
// admin or order they belong to is deleted.
const db = await migratedDatabase();
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const count = async (sql, params = []) => Number((await one(sql, params)).count);
const admin = await one("insert into admins(email,name) values('owner@example.test','Owner') returning id");
const order = await one(
  "insert into orders(order_number,customer_name,email,phone,fulfilment,subtotal,grand_total,currency) values('ND-1','Ada','ada@example.test','9025550100','pickup',900,900,'CAD') returning id",
);
const add = (audience, adminId, orderId, endpoint = "https://push.example/1") =>
  db.query(
    "insert into push_subscriptions(audience,admin_id,order_id,endpoint,p256dh,auth) values($1,$2,$3,$4,'key','auth')",
    [audience, adminId, orderId, endpoint],
  );

await add("admin", admin.id, null);
await add("customer", null, order.id);
// The same browser can follow an order and be an admin device at once.
assert.equal(await count("select count(*) from push_subscriptions"), 2);
await assert.rejects(add("admin", admin.id, null), /duplicate key/);
await assert.rejects(add("customer", null, order.id), /duplicate key/);
await assert.rejects(add("customer", null, null), /check constraint/);
await assert.rejects(add("admin", admin.id, order.id, "https://push.example/2"), /check constraint/);
await assert.rejects(add("customer", null, order.id, "http://push.example/insecure"), /check constraint/);

await db.query("delete from orders where id=$1", [order.id]);
assert.equal(await count("select count(*) from push_subscriptions where audience='customer'"), 0);
await db.query("delete from admins where id=$1", [admin.id]);
assert.equal(await count("select count(*) from push_subscriptions"), 0);

const grants = await one(
  "select has_table_privilege('anon','push_subscriptions','select') as anon, has_table_privilege('service_role','push_subscriptions','insert') as service",
);
assert.deepEqual(grants, { anon: false, service: true });
console.log(
  "PASS push subscriptions: one per browser and owner, owner rules, https only, removed with their order or admin, service-only access",
);

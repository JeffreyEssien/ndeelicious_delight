import assert from "node:assert/strict";
import { migratedDatabase } from "./all-migrations.mjs";
// An order whose lead time has not passed can still move to ready and on to delivered.
const db = await migratedDatabase();
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const order = await one(
  "insert into orders(order_number,customer_name,email,phone,fulfilment,subtotal,grand_total,currency,status,preparation_ready_at) values('ND-50000001','Ada','ada@example.test','9025550100','pickup',2499,2499,'CAD','PREPARING',now()+interval '24 hours') returning id",
);
await db.query("update orders set status='READY' where id=$1", [order.id]);
await db.query("update orders set status='DELIVERED' where id=$1", [order.id]);
assert.equal((await one("select status::text from orders where id=$1", [order.id])).status, "DELIVERED");
console.log("PASS ready when baked: an order can be marked ready before its lead time ends");
await db.close();

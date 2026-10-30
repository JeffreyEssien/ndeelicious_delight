import assert from "node:assert/strict";
import { migratedDatabase } from "./all-migrations.mjs";
// The outbox accepts the earlier-pickup email, and re-arming it for a second move keeps one row.
const db = await migratedDatabase();
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const order = await one(
  "insert into orders(order_number,customer_name,email,phone,fulfilment,subtotal,grand_total,currency,status) values('ND-61000001','Ada','ada@example.test','9025550100','pickup',3000,3000,'CAD','CONFIRMED') returning id",
);
const upsert =
  "insert into order_notifications(order_id,event_type,recipient) values($1,'EARLIER_PICKUP','ada@example.test') on conflict(order_id,event_type,recipient) do update set status='PENDING',attempts=0,sent_at=null";
await db.query(upsert, [order.id]);
await db.query("update order_notifications set status='SENT',attempts=1 where order_id=$1", [order.id]);
await db.query(upsert, [order.id]);
const rows = (await db.query("select status from order_notifications where order_id=$1", [order.id])).rows;
assert.deepEqual(rows, [{ status: "PENDING" }]);
await db.query("update orders set preparation_ready_at=now() where id=$1", [order.id]);
console.log("PASS earlier pickup: the email is queued, re-armed once per move, and the pickup time can change");
await db.close();

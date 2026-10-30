import assert from "node:assert/strict";
import { migratedDatabase } from "./all-migrations.mjs";
// Every successful refund emails the customer: partial ones as PARTIALLY_REFUNDED, the last as REFUNDED.
const db = await migratedDatabase();
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const order = await one(
  "insert into orders(order_number,customer_name,email,phone,fulfilment,subtotal,grand_total,currency,status) values('ND-60000001','Ada','ada@example.test','9025550100','pickup',3000,3000,'CAD','DELIVERED') returning id",
);
const payment = await one(
  "insert into payments(order_id,provider_payment_id,status,amount,currency) values($1,'pi_1','SUCCEEDED',3000,'CAD') returning id",
  [order.id],
);
const admin = await one("insert into admins(email,name) values('owner@example.test','Owner') returning id");
const refund = async (amount) => {
  const row = await one(
    "insert into order_refunds(order_id,payment_id,amount,reason,status,idempotency_key,actor_admin_id) values($1,$2,$3,'Short one pie','PENDING',gen_random_uuid(),$4) returning id",
    [order.id, payment.id, amount, admin.id],
  );
  await db.query("select complete_order_refund($1,$2)", [row.id, `re_${amount}`]);
};
const notice = (type) =>
  one("select status,attempts from order_notifications where order_id=$1 and event_type=$2", [order.id, type]);

await refund(1000);
assert.equal((await notice("PARTIALLY_REFUNDED"))?.status, "PENDING");
console.log("PASS refund emails: a partial refund queues an email");

await db.query("update order_notifications set status='SENT',attempts=1,sent_at=now() where order_id=$1", [order.id]);
await refund(500);
assert.deepEqual(await notice("PARTIALLY_REFUNDED"), { status: "PENDING", attempts: 0 });
console.log("PASS refund emails: a second partial refund queues it again");

await refund(1500);
assert.equal((await notice("REFUNDED"))?.status, "PENDING");
assert.equal(
  (await notice("PARTIALLY_REFUNDED"))?.status,
  "PENDING",
  "the last refund doesn't re-arm the partial email",
);
console.log("PASS refund emails: the refund that completes the total sends the full refund email");
await db.close();

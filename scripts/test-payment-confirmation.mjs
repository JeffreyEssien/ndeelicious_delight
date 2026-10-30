import assert from "node:assert/strict";
import { migratedDatabase } from "./all-migrations.mjs";
// The success page can confirm a payment with Stripe before the webhook arrives. Whichever
// comes second must change nothing, so an order is marked paid (and notified) exactly once.
const db = await migratedDatabase();
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const order = await one(
  "insert into orders(order_number,customer_name,email,phone,fulfilment,subtotal,grand_total,currency) values('ND-79213152','Ada','ada@example.test','9025550100','pickup',2499,2499,'CAD') returning id",
);
const category = await one("insert into categories(name,slug) values('Pies','pies') returning id");
const product = await one(
  "insert into products(category_id,name,slug,short_description,description,base_price,status) values($1,'Meat pies','meat-pies','Pies','Pies',2499,'DRAFT') returning id",
  [category.id],
);
const variant = await one(
  "insert into product_variants(product_id,name,stock_quantity,pack_quantity) values($1,'Box of 6',10,6) returning id",
  [product.id],
);
await db.query("update products set status='ACTIVE' where id=$1", [product.id]);
await db.query(
  "insert into order_items(order_id,product_id,variant_id,product_name,unit_price,quantity,final_price) values($1,$2,$3,'Meat pies',2499,1,2499)",
  [order.id, product.id, variant.id],
);
await db.query(
  "insert into payments(order_id,provider_payment_id,status,amount,currency) values($1,'cs_test_abc','PENDING',2499,'CAD')",
  [order.id],
);
const process = async (eventId) =>
  (
    await one(
      "select process_stripe_checkout_event($1,'checkout.session.completed','cs_test_abc','pi_1','paid',2499,'cad') as result",
      [eventId],
    )
  ).result;

const direct = await process("confirm:cs_test_abc");
assert.equal(direct.becamePaid, true);
const webhook = await process("evt_real_webhook");
assert.equal(webhook.becamePaid, false, "the late webhook must not mark it paid again");
const repeat = await process("confirm:cs_test_abc");
assert.equal(repeat.processed, false, "repeated direct checks are ignored");
assert.deepEqual(
  await one(
    "select o.status as order_status, p.status as payment_status from orders o join payments p on p.order_id=o.id",
  ),
  { order_status: "PAID", payment_status: "SUCCEEDED" },
);
const paidEvents = await one("select count(*)::int as count from order_events where order_id=$1 and to_status='PAID'", [
  order.id,
]);
assert.equal(paidEvents.count, 1);
console.log("PASS payment confirmation: direct check and webhook in either order mark the order paid exactly once");

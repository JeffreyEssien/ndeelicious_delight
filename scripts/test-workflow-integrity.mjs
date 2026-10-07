import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

if (process.env.DATABASE_TEST_AUTHORIZED !== "true") {
  throw new Error("Set DATABASE_TEST_AUTHORIZED=true only for an explicitly authorized test database.");
}
const client = new pg.Client({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  connectionTimeoutMillis: 10_000,
  ssl:
    process.env.DATABASE_TEST_SSL === "false"
      ? false
      : {
          rejectUnauthorized: process.env.DATABASE_TEST_ALLOW_SELF_SIGNED !== "true",
          ca: process.env.DATABASE_TEST_CA_FILE ? await readFile(process.env.DATABASE_TEST_CA_FILE, "utf8") : undefined,
        },
});
let passed = 0;
async function test(name, action) {
  await client.query("savepoint test_case");
  try {
    await action();
    passed++;
    console.log(`PASS ${name}`);
  } finally {
    await client.query("rollback to savepoint test_case");
  }
}
async function rejected(sql, params, message) {
  await client.query("savepoint expected_failure");
  let error;
  try {
    await client.query(sql, params);
  } catch (caught) {
    error = caught;
  }
  await client.query("rollback to savepoint expected_failure");
  assert.ok(error, "Operation unexpectedly succeeded");
  assert.equal(error.message, message);
}
const prefix = `CLOSURE-${randomUUID()}`;
async function order() {
  const { rows } = await client.query(
    `insert into public.orders
    (order_number,customer_name,email,phone,fulfilment,subtotal,grand_total,currency)
    values ($1,'Rollback fixture','closure@example.invalid','0000000000','pickup',1000,1000,'CAD') returning id`,
    [`${prefix}-${randomUUID()}`],
  );
  return rows[0].id;
}
try {
  await client.connect();
  await client.query("begin");
  await client.query("set local statement_timeout = '15s'");
  await client.query("set local lock_timeout = '5s'");
  // Migration changes and all fixture rows are rolled back, even when a check fails.
  await client.query(await readFile(new URL("../db/migrations/0027_workflow_integrity.sql", import.meta.url), "utf8"));
  const cakeTypeId = randomUUID();
  await client.query(
    "insert into public.cake_types(id,name,slug,lead_time_value,lead_time_unit,active,base_price,tax_class) values($1,'Rollback workflow fixture',$2,1,'days',true,0,'FULL_CAKE')",
    [cakeTypeId, `rollback-${cakeTypeId}`],
  );
  const cakeId = randomUUID();
  const documentId = randomUUID();
  const token = randomUUID().replaceAll("-", "").repeat(2);
  await client.query(
    `insert into public.custom_cake_orders
    (id,request_number,customer_name,email,phone,configuration,requested_date,cake_type_id)
    values ($1,$2,'Rollback fixture','closure@example.invalid','0000000000','{}',current_date+30,$3)`,
    [cakeId, prefix, cakeTypeId],
  );
  await client.query(
    `insert into public.business_documents
    (id,kind,number,cake_order_id,business_snapshot,customer_snapshot,line_items_snapshot,totals_snapshot,branding_snapshot)
    values ($1,'QUOTE',$2,$3,'{"pickupEnabled":true,"currency":"CAD"}','{}','[{"name":"Custom cake"}]','{"total":1000}','{}')`,
    [documentId, prefix, cakeId],
  );
  await client.query(
    `insert into public.document_access_tokens(document_id,token_hash,expires_at) values($1,$2,now()+interval '1 day')`,
    [documentId, token],
  );

  for (const field of [
    "number",
    "totals_snapshot",
    "line_items_snapshot",
    "business_snapshot",
    "customer_snapshot",
    "revision",
    "issued_at",
    "order_id",
  ]) {
    await test(`document ${field} immutable`, async () => {
      const mutations = {
        number: "number || '-changed'",
        revision: "revision+1",
        issued_at: "issued_at+interval '1 second'",
        order_id: "gen_random_uuid()",
        line_items_snapshot: "'[]'::jsonb",
      };
      await rejected(
        `update public.business_documents set ${field}=${mutations[field] || "'{\"changed\":true}'::jsonb"} where id=$1`,
        [documentId],
        "BUSINESS_DOCUMENTS_ARE_IMMUTABLE",
      );
    });
  }
  await test("approved presentation persists without changing finances", async () => {
    await client.query("select public.update_document_presentation($1,$2,null)", [
      documentId,
      { design: "modern", notes: "Fixture note" },
    ]);
    const { rows } = await client.query(
      "select presentation_snapshot,totals_snapshot from public.business_documents where id=$1",
      [documentId],
    );
    assert.equal(rows[0].presentation_snapshot.notes, "Fixture note");
    assert.deepEqual(rows[0].totals_snapshot, { total: 1000 });
  });
  await test("presentation cannot include financial fields", async () => {
    await rejected(
      "select public.update_document_presentation($1,$2,null)",
      [documentId, { design: "modern", total: 1 }],
      "INVALID_DOCUMENT_PRESENTATION",
    );
  });
  await test("invalid quote token rejected", async () => {
    await rejected("select public.respond_to_quote($1,'ACCEPTED')", ["0".repeat(64)], "QUOTE_NOT_AVAILABLE");
  });
  await test("revoked quote token rejected", async () => {
    await client.query("select public.revoke_document_tokens($1)", [documentId]);
    await rejected("select public.respond_to_quote($1,'ACCEPTED')", [token], "QUOTE_NOT_AVAILABLE");
  });
  await test("duplicate acceptance and conversion create one inventory-neutral order", async () => {
    await client.query("select public.respond_to_quote($1,'ACCEPTED')", [token]);
    await client.query("select public.respond_to_quote($1,'ACCEPTED')", [token]);
    const first = await client.query(
      "select public.create_order_from_accepted_quote_v2($1,'pickup',null,null,jsonb_build_object('subtotal',1000,'deliveryFee',0,'taxTotal',0,'grandTotal',1000,'taxSnapshot',jsonb_build_object('jurisdiction','CA-NS','total',0),'fulfilment',jsonb_build_object('earliestAt',now()))) as result",
      [token],
    );
    const second = await client.query(
      "select public.create_order_from_accepted_quote_v2($1,'pickup',null,null,jsonb_build_object('subtotal',1000,'deliveryFee',0,'taxTotal',0,'grandTotal',1000,'taxSnapshot',jsonb_build_object('jurisdiction','CA-NS','total',0),'fulfilment',jsonb_build_object('earliestAt',now()))) as result",
      [token],
    );
    assert.equal(first.rows[0].result.orderId, second.rows[0].result.orderId);
    const id = first.rows[0].result.orderId;
    await client.query("select public.reserve_order_inventory($1)", [id]);
    const { rows } = await client.query(
      "select count(*)::int as count from public.inventory_reservations where order_id=$1",
      [id],
    );
    assert.equal(rows[0].count, 0);
    await rejected(
      "update public.custom_cake_orders set status='DELIVERED' where id=$1",
      [cakeId],
      "LINKED_ORDER_STATUS_AUTHORITATIVE",
    );
  });
  await test("unmarked null catalogue references rejected", async () => {
    const id = await order();
    await client.query(
      "insert into public.order_items(order_id,product_name,unit_price,quantity,final_price) values($1,'Invalid',1000,1,1000)",
      [id],
    );
    await rejected("select public.reserve_order_inventory($1)", [id], "PRODUCT_UNAVAILABLE");
  });
  await test("forged custom-cake marker cannot bypass inventory", async () => {
    const id = await order();
    await client.query(
      `insert into public.order_items(order_id,product_name,unit_price,quantity,final_price,product_snapshot)
      values($1,'Invalid',1000,1,1000,'{"type":"CUSTOM_CAKE"}')`,
      [id],
    );
    await rejected("select public.reserve_order_inventory($1)", [id], "PRODUCT_UNAVAILABLE");
  });
  await test("linking a cake with unchanged incompatible status rejected", async () => {
    const id = await order();
    await rejected(
      "update public.custom_cake_orders set order_id=$1 where id=$2",
      [id, cakeId],
      "LINKED_ORDER_STATUS_AUTHORITATIVE",
    );
  });
  const sku = (await client.query("select id,product_id from public.product_variants where active=true limit 1"))
    .rows[0];
  assert.ok(sku, "A test catalogue variant is required");
  async function catalogueOrder(quantity = 1) {
    const id = await order();
    await client.query(
      `insert into public.order_items(order_id,product_id,variant_id,product_name,unit_price,quantity,final_price)
      values($1,$2,$3,'Fixture catalogue item',1000,$4,1000*$4)`,
      [id, sku.product_id, sku.id, quantity],
    );
    return id;
  }
  await test("tracked catalogue variant reserves stock idempotently", async () => {
    await client.query("update public.products set track_inventory=true,status='ACTIVE' where id=$1", [sku.product_id]);
    await client.query("select public.set_variant_inventory($1,$2,10)", [sku.product_id, sku.id]);
    const id = await catalogueOrder();
    await client.query("select public.reserve_order_inventory($1)", [id]);
    await client.query("select public.reserve_order_inventory($1)", [id]);
    const { rows } = await client.query(
      "select count(*)::int as count,sum(quantity)::int as quantity from public.inventory_reservations where order_id=$1",
      [id],
    );
    assert.deepEqual(rows[0], { count: 1, quantity: 1 });
  });
  await test("untracked catalogue products do not reserve stock", async () => {
    await client.query("update public.products set track_inventory=false,status='ACTIVE' where id=$1", [
      sku.product_id,
    ]);
    const id = await catalogueOrder();
    await client.query("select public.reserve_order_inventory($1)", [id]);
    assert.equal(
      (await client.query("select count(*)::int as count from public.inventory_reservations where order_id=$1", [id]))
        .rows[0].count,
      0,
    );
  });
  await test("out-of-stock catalogue products rejected", async () => {
    await client.query("update public.products set status='OUT_OF_STOCK' where id=$1", [sku.product_id]);
    await rejected("select public.reserve_order_inventory($1)", [await catalogueOrder()], "PRODUCT_UNAVAILABLE");
  });
  await test("second reservation cannot oversell held variant stock", async () => {
    await client.query("update public.products set track_inventory=true,status='ACTIVE' where id=$1", [sku.product_id]);
    await client.query("select public.set_variant_inventory($1,$2,1)", [sku.product_id, sku.id]);
    await client.query("select public.reserve_order_inventory($1)", [await catalogueOrder()]);
    await rejected("select public.reserve_order_inventory($1)", [await catalogueOrder()], "INSUFFICIENT_STOCK");
  });
  await test("mixed invalid line rejects entire reservation", async () => {
    await client.query("update public.products set track_inventory=true,status='ACTIVE' where id=$1", [sku.product_id]);
    await client.query("select public.set_variant_inventory($1,$2,10)", [sku.product_id, sku.id]);
    const id = await catalogueOrder();
    await client.query(
      "insert into public.order_items(order_id,product_name,unit_price,quantity,final_price) values($1,'Invalid',1000,1,1000)",
      [id],
    );
    await rejected("select public.reserve_order_inventory($1)", [id], "PRODUCT_UNAVAILABLE");
    assert.equal(
      (await client.query("select count(*)::int as count from public.inventory_reservations where order_id=$1", [id]))
        .rows[0].count,
      0,
    );
  });
  await test("linked cake follows all successful fulfilment states and refund", async () => {
    await client.query("select public.respond_to_quote($1,'ACCEPTED')", [token]);
    const result = await client.query(
      "select public.create_order_from_accepted_quote_v2($1,'pickup',null,null,jsonb_build_object('subtotal',1000,'deliveryFee',0,'taxTotal',0,'grandTotal',1000,'taxSnapshot',jsonb_build_object('jurisdiction','CA-NS','total',0),'fulfilment',jsonb_build_object('earliestAt',now()))) as result",
      [token],
    );
    const id = result.rows[0].result.orderId;
    await client.query("select public.reserve_order_inventory($1)", [id]);
    for (const status of ["PAID", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "REFUNDED"]) {
      await client.query("select public.transition_order_status($1,$2)", [result.rows[0].result.orderNumber, status]);
      assert.equal(
        (await client.query("select status from public.custom_cake_orders where id=$1", [cakeId])).rows[0].status,
        status,
      );
    }
  });
  await test("linked cancellation follows order and cannot be detached", async () => {
    await client.query("select public.respond_to_quote($1,'ACCEPTED')", [token]);
    const result = await client.query(
      "select public.create_order_from_accepted_quote_v2($1,'pickup',null,null,jsonb_build_object('subtotal',1000,'deliveryFee',0,'taxTotal',0,'grandTotal',1000,'taxSnapshot',jsonb_build_object('jurisdiction','CA-NS','total',0),'fulfilment',jsonb_build_object('earliestAt',now()))) as result",
      [token],
    );
    await client.query("select public.transition_order_status($1,'CANCELLED')", [result.rows[0].result.orderNumber]);
    assert.equal(
      (await client.query("select status from public.custom_cake_orders where id=$1", [cakeId])).rows[0].status,
      "CANCELLED",
    );
    await rejected(
      "update public.custom_cake_orders set order_id=null where id=$1",
      [cakeId],
      "LINKED_ORDER_STATUS_AUTHORITATIVE",
    );
  });
  await test("quote delivery state is service-only and lease persists", async () => {
    await client.query(
      "insert into public.document_deliveries(document_id,recipient,status,lease_expires_at) values($1,'closure@example.invalid','SENDING',now()-interval '1 minute')",
      [documentId],
    );
    const { rows } = await client.query(
      "select status,lease_expires_at < now() as expired from public.document_deliveries where document_id=$1",
      [documentId],
    );
    assert.deepEqual(rows[0], { status: "SENDING", expired: true });
    const permissions = await client.query(
      "select has_table_privilege('anon','public.document_deliveries','SELECT') as anon,has_table_privilege('authenticated','public.document_deliveries','UPDATE') as authenticated",
    );
    assert.deepEqual(permissions.rows[0], { anon: false, authenticated: false });
  });
  async function paymentFixture() {
    await client.query("update public.products set track_inventory=true,status='ACTIVE' where id=$1", [sku.product_id]);
    await client.query("select public.set_variant_inventory($1,$2,10)", [sku.product_id, sku.id]);
    const id = await catalogueOrder();
    await client.query("select public.reserve_order_inventory($1)", [id]);
    const session = `cs_test_${randomUUID()}`;
    await client.query(
      "insert into public.payments(order_id,provider_payment_id,amount,currency) values($1,$2,1000,'CAD')",
      [id, session],
    );
    return { id, session };
  }
  async function webhook(session, type, amount = 1000, event = `evt_${randomUUID()}`) {
    return client.query("select public.process_stripe_checkout_event($1,$2,$3,null,$4,$5,'cad') as result", [
      event,
      type,
      session,
      type === "checkout.session.completed" ? "paid" : "unpaid",
      amount,
    ]);
  }
  await test("payment amount tampering rejected atomically", async () => {
    const { session } = await paymentFixture();
    await rejected(
      "select public.process_stripe_checkout_event($1,'checkout.session.completed',$2,null,'paid',1,'cad')",
      [`evt_${randomUUID()}`, session],
      "PAYMENT_AMOUNT_MISMATCH",
    );
  });
  await test("duplicate webhook deducts inventory exactly once", async () => {
    const { id, session } = await paymentFixture();
    const event = `evt_${randomUUID()}`;
    assert.equal((await webhook(session, "checkout.session.completed", 1000, event)).rows[0].result.becamePaid, true);
    assert.equal((await webhook(session, "checkout.session.completed", 1000, event)).rows[0].result.processed, false);
    assert.equal((await webhook(session, "checkout.session.completed")).rows[0].result.becamePaid, false);
    assert.equal(
      (await client.query("select stock_quantity from public.product_variants where id=$1", [sku.id])).rows[0]
        .stock_quantity,
      9,
    );
    assert.equal((await client.query("select status from public.orders where id=$1", [id])).rows[0].status, "PAID");
  });
  await test("expired checkout releases stock and retry reuses the order", async () => {
    const { id, session } = await paymentFixture();
    await webhook(session, "checkout.session.expired");
    assert.equal((await client.query("select status from public.orders where id=$1", [id])).rows[0].status, "FAILED");
    assert.equal(
      (
        await client.query(
          "select count(*)::int as count from public.inventory_reservations where order_id=$1 and status='ACTIVE'",
          [id],
        )
      ).rows[0].count,
      0,
    );
    await client.query("select public.prepare_order_payment_retry($1)", [id]);
    assert.equal(
      (await client.query("select status from public.orders where id=$1", [id])).rows[0].status,
      "PENDING_PAYMENT",
    );
    assert.equal(
      (await client.query("select stock_quantity from public.product_variants where id=$1", [sku.id])).rows[0]
        .stock_quantity,
      10,
    );
  });
  console.log(`Database workflow checks: ${passed} passed; all changes rolled back.`);
} finally {
  await client.query("rollback").catch(() => {});
  await client.end();
}

import assert from "node:assert/strict";
import { migratedDatabase } from "./all-migrations.mjs";
// Stock adjustments record why they happened, and callers that don't give a reason still work.
const db = await migratedDatabase();
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const admin = await one("insert into admins(email,name) values('owner@example.test','Ndidi') returning id");
const session = await one(
  "insert into admin_sessions(admin_id,token_hash,expires_at) values($1,'t',now()+interval '1 day') returning id",
  [admin.id],
);
const category = await one("insert into categories(name,slug) values('Pies','pies') returning id");
const product = await one(
  "insert into products(category_id,name,slug,short_description,description,base_price,status) values($1,'Meat pies','meat-pies','Pies','Pies',2499,'DRAFT') returning id",
  [category.id],
);
const variant = await one(
  "insert into product_variants(product_id,name,stock_quantity,pack_quantity) values($1,'Box of 6',3,6) returning id",
  [product.id],
);
const adjust = (expected, mode, quantity, reason) =>
  reason === undefined
    ? db.query("select admin_adjust_inventory($1,$2,$3,$4,$5,$6,$7) as stock", [
        product.id,
        variant.id,
        expected,
        mode,
        quantity,
        admin.id,
        session.id,
      ])
    : db.query("select admin_adjust_inventory($1,$2,$3,$4,$5,$6,$7,$8) as stock", [
        product.id,
        variant.id,
        expected,
        mode,
        quantity,
        admin.id,
        session.id,
        reason,
      ]);

assert.equal((await adjust(3, "add", 12, "Baked a batch")).rows[0].stock, 15);
assert.equal((await adjust(15, "remove", 2)).rows[0].stock, 13, "callers without a reason still work");
assert.equal((await adjust(13, "set", 10, "   ")).rows[0].stock, 10);
await assert.rejects(adjust(10, "add", 1, "x".repeat(201)), /INVALID_REASON/);
await assert.rejects(adjust(99, "add", 1, "Baked a batch"), /INVENTORY_CHANGED/);
const history = (
  await db.query(
    "select previous_value->>'stockQuantity' as from_qty, new_value->>'stockQuantity' as to_qty, metadata from admin_audit_logs where action='INVENTORY_ADJUSTED' and entity_id=$1 order by created_at, id",
    [variant.id],
  )
).rows;
assert.equal(history.length, 3);
assert.deepEqual(history[0], {
  from_qty: "3",
  to_qty: "15",
  metadata: { mode: "add", quantity: 12, reason: "Baked a batch" },
});
assert.deepEqual(history[1].metadata, { mode: "remove", quantity: 2 }, "no reason, no reason key");
assert.deepEqual(history[2].metadata, { mode: "set", quantity: 10 }, "a blank reason is dropped");
assert.equal((await one("select stock_quantity from product_variants where id=$1", [variant.id])).stock_quantity, 10);
console.log("PASS stock adjustments: reasons recorded, optional, length-checked; stale and old-style calls behave");

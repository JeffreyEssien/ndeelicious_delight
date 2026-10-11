import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const read = (name) => fs.readFileSync(new URL(`../db/migrations/${name}`, import.meta.url), "utf8");
await db.exec("create role anon; create role authenticated; create role service_role;");
await db.exec(read("0001_initial.sql").replace("create extension if not exists pgcrypto;", ""));
await db.exec(read("0034_admin_history.sql"));
async function history(kind, filters = {}) {
  const { rows } = await db.query("select public.admin_history_page($1,$2::jsonb) as result", [
    kind,
    JSON.stringify(filters),
  ]);
  return rows[0].result;
}
for (const kind of ["orders", "cakes"]) {
  for (const size of kind === "orders" ? [0, 5, 100, 101, 500, 1000, 5001] : [0, 100, 101, 500, 5001]) {
    await db.exec("truncate payments,order_items,custom_cake_orders,orders cascade");
    if (kind === "orders")
      await db.query(
        `insert into orders(order_number,customer_name,email,phone,status,fulfilment,subtotal,grand_total,created_at)
      select 'ORD-'||n, 'Customer '||n, 'buyer'||n||'@test.example','555-'||n,
        case when n%2=0 then 'PREPARING'::order_status else 'PENDING_PAYMENT'::order_status end,
        case when n%2=0 then 'pickup' else 'delivery' end,n*100,n*100,'2026-01-01'::timestamptz+n*interval '1 second'
      from generate_series(1,$1::int) n`,
        [size],
      );
    else
      await db.query(
        `insert into custom_cake_orders(request_number,customer_name,email,phone,status,configuration,requested_date,created_at)
      select 'CAKE-'||n,'Customer '||n,'buyer'||n||'@test.example','555-'||n,
        case when n%2=0 then 'PREPARING'::cake_status else 'QUOTE_REQUIRED'::cake_status end,
        '{"occasion":"Birthday"}','2027-01-01','2026-01-01'::timestamptz+n*interval '1 second'
      from generate_series(1,$1::int) n`,
        [size],
      );
    const first = await history(kind);
    assert.equal(first.total, size);
    assert.equal(first.rows.length, Math.min(25, size));
    assert.equal(first.counts.ALL ?? 0, size);
    assert.equal(first.counts.PREPARING ?? 0, Math.floor(size / 2));
    const seen = new Set();
    for (let page = 1; page <= Math.ceil(size / 100); page++) {
      const result = await history(kind, { page, size: 100, asOf: first.asOf });
      assert.equal(result.total, size);
      assert.deepEqual(result.counts, first.counts);
      for (const row of result.rows) {
        assert.ok(!seen.has(row.id), "duplicate page row");
        seen.add(row.id);
      }
    }
    assert.equal(seen.size, size);
    for (const pageSize of [25, 50, 100])
      assert.equal((await history(kind, { size: pageSize })).rows.length, Math.min(pageSize, size));
    if (size) {
      for (const q of [kind === "orders" ? "ORD-1" : "CAKE-1", "buyer1@test.example", "555-1"])
        assert.ok(
          (await history(kind, { q, sort: "oldest" })).rows.some(
            (r) => r.number === (kind === "orders" ? "ORD-1" : "CAKE-1"),
          ),
        );
      const filtered = await history(kind, { category: "PREPARING" });
      assert.equal(filtered.total, Math.floor(size / 2));
      assert.equal(filtered.counts.ALL, size);
      assert.equal((await history(kind, { sort: "oldest" })).rows[0].number, kind === "orders" ? "ORD-1" : "CAKE-1");
      assert.equal((await history(kind, { from: "2025-12-01", to: "2025-12-31" })).total, 0);
    }
    console.log(`PASS ${kind}: ${size} records, reachability, full-history search/counts, stable pagination`);
  }
}
await db.exec("truncate payments,order_items,custom_cake_orders,orders cascade");
await db.exec(`insert into orders(order_number,customer_name,email,phone,status,fulfilment,subtotal,grand_total,created_at)
 select 'ORD-'||n,'Same date','test@example.test','555','PREPARING','pickup',100,100,'2026-01-01' from generate_series(1,101) n`);
const before = await history("orders");
await db.exec(`insert into orders(order_number,customer_name,email,phone,fulfilment,subtotal,grand_total,created_at)
 values('NEW','New','new@example.test','555','pickup',100,100,now()+interval '1 second')`);
const frozen = await history("orders", { asOf: before.asOf });
assert.deepEqual(frozen.rows, before.rows);
assert.equal(frozen.total, 101);
assert.equal((await history("orders", { asOf: new Date(Date.now() + 3000).toISOString() })).total, 102);
const orderId = before.rows[0].id;
await db.query(
  "insert into payments(order_id,provider_payment_id,status,amount,created_at) values($1,'first','FAILED',100,'2026-01-01'),($1,'second','SUCCEEDED',100,'2026-01-02')",
  [orderId],
);
await db.query(
  "insert into order_items(order_id,product_name,unit_price,quantity,final_price) values($1,'Cake',100,3,300)",
  [orderId],
);
assert.equal((await history("orders", { payment: "SUCCEEDED" })).total, 1);
assert.equal((await history("orders", { payment: "FAILED" })).total, 0);
assert.equal((await history("orders", { payment: "SUCCEEDED" })).rows[0].items, 3);
await assert.rejects(history("orders", { size: 10000 }), /Invalid history query/);
await assert.rejects(history("unknown"), /Invalid history query/);
for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  await assert.rejects(history("orders"), /permission denied/);
  await db.exec("reset role");
}
console.log("PASS snapshot insertion, unique ties, latest payment, item totals, invalid queries and RPC grants");
await db.close();

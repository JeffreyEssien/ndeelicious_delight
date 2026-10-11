import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec("create role anon; create role authenticated; create role service_role;");
for (const name of ["0001_initial.sql", "0040_admin_customer_pages.sql"])
  await db.exec(
    fs
      .readFileSync(new URL(`../db/migrations/${name}`, import.meta.url), "utf8")
      .replace("create extension if not exists pgcrypto;", ""),
  );
await db.exec(`insert into orders(order_number,customer_name,email,phone,fulfilment,subtotal,grand_total,status,created_at)
select 'CUSTOMER-'||n,'Customer '||n,'customer'||n||'@example.test','555','pickup',10000,10000,'PAID','2026-10-01' from generate_series(1,5001) n;
insert into orders(order_number,customer_name,email,phone,fulfilment,subtotal,grand_total,status,created_at)
values ('REPEAT','New name','Customer1@example.test','555','pickup',5000,5000,'PAID','2026-10-02'),('UNPAID','New name','customer1@example.test','555','pickup',5000,5000,'PENDING_PAYMENT','2026-10-03');`);
for (const size of [25, 50, 100]) {
  const seen = new Set();
  for (let page = 1; page <= Math.ceil(5001 / size); page++) {
    const value = (await db.query("select admin_customer_page('', $1, $2) value", [page, size])).rows[0].value;
    assert.equal(value.total, 5001);
    assert.ok(value.rows.length <= size);
    for (const row of value.rows) {
      assert.ok(!seen.has(row.email));
      seen.add(row.email);
    }
  }
  assert.equal(seen.size, 5001);
}
const filtered = (await db.query("select admin_customer_page('customer1@example.test') value")).rows[0].value;
assert.equal(filtered.total, 1);
assert.equal(filtered.rows[0].orders, 3);
assert.equal(filtered.rows[0].spent, 15000);
assert.equal(filtered.rows[0].name, "New name");
await db.exec("set role anon;");
await assert.rejects(db.query("select admin_customer_page()"), /permission denied/);
await db.close();
console.log(
  "PASS: 5001 customers, complete 25/50/100 pagination, case-insensitive repeat customers, unpaid exclusion, service-only grants.",
);

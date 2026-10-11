import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec("create role anon; create role authenticated; create role service_role;");
for (const name of [
  "0001_initial.sql",
  "0005_inventory_integrity.sql",
  "0012_order_lifecycle.sql",
  "0038_admin_dashboard.sql",
])
  await db.exec(
    fs
      .readFileSync(new URL(`../db/migrations/${name}`, import.meta.url), "utf8")
      .replace("create extension if not exists pgcrypto;", ""),
  );
const now = "2026-10-10T12:00:00Z";
const read = async () => (await db.query("select admin_dashboard_summary($1) value", [now])).rows[0].value;
let value = await read();
assert.equal(value.netRevenue, 0);
assert.equal(value.paidOrders, 0);
assert.deepEqual(value.recentOrders, []);
await db.exec(`insert into orders(order_number,customer_name,email,phone,fulfilment,subtotal,grand_total,status,created_at)
 select 'DASH-'||n,'Customer '||n,'customer'||n||'@example.test','555','pickup',10000,10000,'PAID','2026-10-01T12:00:00Z' from generate_series(1,5001) n;
 insert into orders(order_number,customer_name,email,phone,fulfilment,subtotal,grand_total,status,created_at)
 values('PREVIOUS','Returning','Customer1@example.test','555','pickup',5000,5000,'PAID','2026-09-01T12:00:00Z');`);
value = await read();
assert.equal(value.paidOrders, 5001);
assert.equal(value.netRevenue, 50010000);
assert.equal(value.averageOrderValue, 10000);
assert.equal(value.returningCustomers, 1);
assert.ok(Math.abs(value.repeatCustomerRate - 100 / 5001) < 0.00001);
assert.equal(value.recentOrders.length, 5);
await db.exec(`insert into payments(order_id,provider,provider_payment_id,status,amount,currency,paid_at,created_at,refunded_amount)
 select id,'stripe','partial-1','PARTIALLY_REFUNDED',10000,'CAD','2026-10-01T12:00:00Z','2026-10-01T12:00:00Z',3000 from orders where order_number='DASH-1';
 insert into payments(order_id,provider,provider_payment_id,status,amount,currency,created_at)
 select id,'stripe','failed-2','FAILED',10000,'CAD','2026-10-02T12:00:00Z' from orders where order_number='DASH-2';`);
value = await read();
assert.equal(value.paidOrders, 5000);
assert.equal(value.netRevenue, 49997000);
assert.equal(value.averageOrderValue, 9999);
await db.exec(`insert into categories(name,slug) values('Cakes','cakes');
 insert into products(category_id,name,slug,short_description,description,base_price,sku,status,track_inventory,low_stock_threshold)
 select id,'Tracked','tracked','Cake','Cake',100,'TRACKED','ACTIVE',true,5 from categories where slug='cakes';
 insert into product_variants(product_id,name,stock_quantity,active) select id,'Low',2,true from products where slug='tracked';
 insert into product_variants(product_id,name,stock_quantity,active) select id,'Inactive',0,false from products where slug='tracked';
 insert into custom_cake_orders(request_number,customer_name,email,phone,configuration,requested_date,status)
 values('CAKE-DASH','Customer','cake@example.test','555','{}','2026-11-01','QUOTE_REQUIRED');`);
value = await read();
assert.equal(value.lowStockProducts, 1);
assert.equal(value.waitingQuotes, 1);
await db.exec("set role anon;");
await assert.rejects(read(), /permission denied/);
console.log(
  "PASS dashboard 0/5001 records, bounded five summaries, payment/refund/average/returning-customer semantics, global stock and quote counts, service-only grants",
);
await db.close();

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const read = (name) => fs.readFileSync(new URL(`../db/migrations/${name}`, import.meta.url), "utf8");
await db.exec("create role anon;create role authenticated;create role service_role;");
await db.exec(read("0001_initial.sql").replace("create extension if not exists pgcrypto;", ""));
await db.exec(read("0036_inventory_pagination.sql"));
async function page(filters = {}) {
  return (await db.query("select admin_inventory_page($1::jsonb) as result", [JSON.stringify(filters)])).rows[0].result;
}
assert.equal((await page()).total, 0);
await db.exec(`insert into products(category_id,name,slug,short_description,description,base_price,status,track_inventory) select (select id from categories limit 1),'Product '||n,'p-'||n,'Short','Detail',100,case when n<=10 then 'DRAFT'::product_status else 'ACTIVE'::product_status end,n>20 from generate_series(1,501) n;
insert into product_variants(product_id,name,sku,stock_quantity,active) select id,'Variant','SKU-'||slug,case when slug='p-501' then 0 else 3 end,true from products;
insert into product_variants(product_id,name,stock_quantity,active) select id,'Inactive',0,false from products;`);
const first = await page({ category: "ALL" });
assert.equal(first.total, 481);
assert.equal(first.ids.length, 25);
assert.equal(first.counts.OUT, 1);
assert.equal(first.counts.LOW, 480);
assert.equal(first.counts.INACTIVE, 10);
assert.equal(first.counts.UNTRACKED, 20);
const seen = new Set();
for (let n = 1; n <= 5; n++) {
  const result = await page({ category: "ALL", page: n, size: 100 });
  assert.deepEqual(result.counts, first.counts);
  for (const id of result.ids) {
    assert.ok(!seen.has(id));
    seen.add(id);
  }
}
assert.equal(seen.size, 481);
assert.equal((await page({ category: "ALL", q: "SKU-p-501" })).total, 1);
assert.equal((await page({ category: "OUT" })).total, 1);
assert.equal((await page({ category: "ALL", q: "Product 501", sort: "quantity" })).ids.length, 1);
console.log(
  "PASS 501 grouped products, complete reachability, database counts, SKU search, inactive/untracked exclusions and bounded pages",
);
await db.close();

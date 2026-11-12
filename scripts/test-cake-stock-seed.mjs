import assert from "node:assert/strict";
import fs from "node:fs";
import { migratedDatabase } from "./all-migrations.mjs";
// 0065 gives every cake size 100 in stock, leaves retired sizes and non-cake products alone,
// and brings a sold-out cake back to ACTIVE through the variant stock trigger.
const db = await migratedDatabase();
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const migration = fs.readFileSync(new URL("../db/migrations/0065_seed_cake_stock.sql", import.meta.url), "utf8");

const cakes = await one("select id from categories where slug='custom-cakes'");
const pies = await one("insert into categories(name,slug) values('Pies','pies') returning id");
const product = (categoryId, slug, status) =>
  one(
    "insert into products(category_id,name,slug,short_description,description,base_price,status) values($1,$2,$2,'x','x',5000,$3) returning id",
    [categoryId, slug, status],
  );
const variant = (productId, name, stock, extra = {}) =>
  one(
    "insert into product_variants(product_id,name,stock_quantity,pack_quantity,active,retired_at) values($1,$2,$3,1,$4,$5) returning id",
    [productId, name, stock, extra.active ?? true, extra.retiredAt ?? null],
  );

const berry = await product(cakes.id, "berry-cake", "ACTIVE");
const small = await variant(berry.id, "6 inch", 0);
const large = await variant(berry.id, "10 inch", 250);
const hidden = await variant(berry.id, "12 inch", 2, { active: false });
const retired = await variant(berry.id, "4 inch", 5, { active: false, retiredAt: new Date() });
const soldOut = await product(cakes.id, "choc-cake", "ACTIVE");
const soldOutSize = await variant(soldOut.id, "8 inch", 0);
const pie = await product(pies.id, "meat-pies", "ACTIVE");
const pieBox = await variant(pie.id, "Box of 6", 4);

await db.exec(migration);
const stock = async (id) => (await one("select stock_quantity from product_variants where id=$1", [id])).stock_quantity;
assert.equal(await stock(small.id), 100);
assert.equal(await stock(large.id), 100);
assert.equal(await stock(hidden.id), 100);
assert.equal(await stock(retired.id), 5, "retired sizes are untouched");
assert.equal(await stock(soldOutSize.id), 100);
assert.equal(await stock(pieBox.id), 4, "non-cake products are untouched");
assert.equal((await one("select stock_quantity from products where id=$1", [berry.id])).stock_quantity, 200);
assert.equal((await one("select status from products where id=$1", [soldOut.id])).status, "ACTIVE");

await db.exec(migration); // running it again changes nothing
assert.equal(await stock(small.id), 100);
console.log("cake stock seed: ok");

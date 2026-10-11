import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(
  "create table products(id integer primary key, preparation_hours integer not null default 0 check (preparation_hours between 0 and 8760)); insert into products values (1,2);",
);
await db.exec(fs.readFileSync("db/migrations/0039_product_preparation_minutes.sql", "utf8"));
assert.equal((await db.query("select preparation_hours from products where id=1")).rows[0].preparation_hours, 2);
for (const minutes of [1, 15, 45, 90, 525600]) {
  await db.query("update products set preparation_hours=$1 where id=1", [minutes / 60]);
  const stored = (await db.query("select preparation_hours from products where id=1")).rows[0].preparation_hours;
  assert.equal(Math.round(stored * 60), minutes);
}
for (const hours of [-1, 8761, 0.001, Number.NaN, Infinity])
  await assert.rejects(db.query("update products set preparation_hours=$1 where id=1", [hours]));
console.log(
  "PASS migration 0039: preserves existing hours; persists whole minutes; rejects negative, excessive, nonfinite and fractional-minute values",
);
await db.close();

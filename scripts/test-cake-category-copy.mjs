import assert from "node:assert/strict";
import { migratedDatabase } from "./all-migrations.mjs";
// 0062 swaps the old cake builder copy for the category tiles copy and drops the unused steps and photo.
const db = await migratedDatabase();
const { rows } = await db.query("select value->'home'->'cakeFeature' as feature from site_settings where key='content'");
assert.deepEqual(rows[0].feature, {
  eyebrow: "Our cakes",
  headline: "A cake for every occasion",
  body: "",
  buttonLabel: "See all cakes",
});
console.log("PASS cake category copy: old builder copy replaced, steps and photo removed");
await db.close();

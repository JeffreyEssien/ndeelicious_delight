import assert from "node:assert/strict";
import fs from "node:fs";
import { migratedDatabase } from "./all-migrations.mjs";
// 0063 raises custom cakes below 7 days to 7 days, keeps longer times and leaves other products alone.
const db = await migratedDatabase();
await db.exec(`
insert into products(category_id,name,slug,short_description,description,base_price,preparation_hours)
select c.id, p.name, p.slug, 'Short', 'Detail', 100, p.hours
from (values ('custom-cakes','Short cake','short-cake',48::double precision),
             ('custom-cakes','Long cake','long-cake',336),
             ('pastries','Pie','pie',2)) as p(category, name, slug, hours)
join categories c on c.slug = p.category;
insert into cake_types(name,slug,lead_time_value,lead_time_unit,active) values
  ('Quick','quick',3,'days',true), ('Draft','draft',0,'days',false), ('Wedding','wedding',3,'weeks',true);
`);
await db.exec(
  fs.readFileSync(new URL("../db/migrations/0063_custom_cake_seven_day_lead_time.sql", import.meta.url), "utf8"),
);
const products = Object.fromEntries(
  (await db.query("select slug, preparation_hours from products")).rows.map((row) => [row.slug, row.preparation_hours]),
);
assert.deepEqual(products, { "short-cake": 168, "long-cake": 336, pie: 2 });
const types = Object.fromEntries(
  (await db.query("select slug, lead_time_value::int as value, lead_time_unit as unit from cake_types")).rows.map(
    (row) => [row.slug, `${row.value} ${row.unit}`],
  ),
);
assert.deepEqual(types, { quick: "7 days", draft: "7 days", wedding: "3 weeks" });
console.log("PASS cake lead time: cakes under 7 days raised to 7 days, longer times and other products kept");

// 0064 drops saved cake builder wording and keeps the rest.
await db.exec(`update site_settings set value = jsonb_set(value, '{customerText}',
  '{"cake builder": {"Step": "Stage"}, "footer": {"Shop": "Browse"}}'::jsonb, true) where key = 'content'`);
await db.exec(fs.readFileSync(new URL("../db/migrations/0064_remove_cake_builder_text.sql", import.meta.url), "utf8"));
const { rows } = await db.query("select value->'customerText' as text from site_settings where key = 'content'");
assert.deepEqual(rows[0].text, { footer: { Shop: "Browse" } });
console.log("PASS cake builder wording removed, other saved wording kept");
await db.close();

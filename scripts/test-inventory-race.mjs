import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

if (process.env.DATABASE_TEST_AUTHORIZED !== "true" || process.env.DATABASE_TEST_COMMITTED_FIXTURES !== "true") {
  throw new Error("Requires explicit test-database authorization and disposable committed fixtures.");
}
const config = {
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  connectionTimeoutMillis: 10_000,
  ssl: { rejectUnauthorized: process.env.DATABASE_TEST_ALLOW_SELF_SIGNED !== "true" },
};
const owner = new pg.Client(config);
const competitors = [new pg.Client(config), new pg.Client(config)];
const ids = [randomUUID(), randomUUID()];
try {
  await owner.connect();
  const before = (await owner.query("select count(*)::int as count from public.orders")).rows[0].count;
  const { rows } = await owner.query(`select v.id,v.product_id,v.stock_quantity from public.product_variants v
    join public.products p on p.id=v.product_id
    where v.active and v.stock_quantity>0 and p.status='ACTIVE' and p.track_inventory
      and not exists(select 1 from public.inventory_reservations r where r.product_id=p.id and r.status='ACTIVE' and r.expires_at>now())
    order by v.id limit 1`);
  assert.ok(rows[0], "Requires one stocked variant without existing reservations");
  const variant = rows[0];
  await owner.query("begin");
  for (const id of ids) {
    await owner.query(
      `insert into public.orders(id,order_number,customer_name,email,phone,fulfilment,subtotal,grand_total,currency)
      values($1,$2,'Concurrency fixture','closure@example.invalid','0000000000','pickup',1000,1000,'CAD')`,
      [id, `RACE-${id}`],
    );
    await owner.query(
      `insert into public.order_items(order_id,product_id,variant_id,product_name,unit_price,quantity,final_price)
      values($1,$2,$3,'Concurrency fixture',1000,$4,1000*$4)`,
      [id, variant.product_id, variant.id, variant.stock_quantity],
    );
  }
  await owner.query("commit");
  await Promise.all(competitors.map((client) => client.connect()));
  const results = await Promise.allSettled(
    competitors.map(async (client, index) => {
      await client.query("set statement_timeout='15s'");
      return client.query("select public.reserve_order_inventory($1)", [ids[index]]);
    }),
  );
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const loser = results.find((result) => result.status === "rejected");
  assert.equal(loser.reason.message, "INSUFFICIENT_STOCK");
  const held = (
    await owner.query(
      "select sum(quantity)::int as quantity from public.inventory_reservations where order_id=any($1::uuid[]) and status='ACTIVE'",
      [ids],
    )
  ).rows[0].quantity;
  assert.equal(held, variant.stock_quantity);
  assert.equal(
    (await owner.query("select stock_quantity from public.product_variants where id=$1", [variant.id])).rows[0]
      .stock_quantity,
    variant.stock_quantity,
  );
  console.log("PASS simultaneous reservations: one winner, one stock rejection, zero oversales, stock unchanged.");
  await owner.query("begin");
  await owner.query("delete from public.inventory_reservations where order_id=any($1::uuid[])", [ids]);
  await owner.query("delete from public.order_items where order_id=any($1::uuid[])", [ids]);
  await owner.query("delete from public.orders where id=any($1::uuid[])", [ids]);
  assert.equal((await owner.query("select count(*)::int as count from public.orders")).rows[0].count, before);
  await owner.query("commit");
  console.log("PASS disposable orders, items and reservations removed; original order count restored.");
} finally {
  await owner.query("rollback").catch(() => {});
  // Cleanup also runs when a race assertion or connection fails.
  try {
    await owner.query("begin");
    await owner.query("delete from public.inventory_reservations where order_id=any($1::uuid[])", [ids]);
    await owner.query("delete from public.order_items where order_id=any($1::uuid[])", [ids]);
    await owner.query("delete from public.orders where id=any($1::uuid[])", [ids]);
    await owner.query("commit");
  } catch {
    await owner.query("rollback").catch(() => {});
    console.error("Inventory race fixture cleanup failed; inspect the test database before further tests.");
    process.exitCode = 1;
  } finally {
    await Promise.all(competitors.map((client) => client.end().catch(() => {})));
    await owner.end();
  }
}

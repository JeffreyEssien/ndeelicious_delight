import pg from "pg";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const db = new pg.Client({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  connectionTimeoutMillis: 15000,
});
try {
  await db.connect();
  const setup = (
    await db.query(`select
    (select count(*)::int from public.cake_types where active) as active_cake_types,
    (select count(*)::int from public.cake_types where active and base_price is not null) as priced_cake_types,
    (select count(*)::int from public.cake_type_options) as cake_option_assignments,
    (select count(*)::int from public.delivery_zones where active and cardinality(postal_code_prefixes)>0) as covered_delivery_areas,
    (select count(*)::int from public.products where status='ACTIVE' and tax_class='REQUIRES_REVIEW') as active_products_needing_tax_review,
    (select count(*)::int from public.product_variants where active and pack_quantity is null) as active_variants_without_pack_count,
    (select value->'fulfilmentSchedule' is not null from public.site_settings where key='business') as has_schedule,
    (select value->>'deliveryTaxMode' is not null from public.site_settings where key='business') as has_delivery_tax_mode`)
  ).rows[0];
  console.log("Owner setup counts:", JSON.stringify(setup));
  const permissions = (
    await db.query(
      "select has_function_privilege('service_role','public.create_order_from_accepted_quote_v2(text,text,uuid,jsonb,jsonb)','execute') as quote_v2,not has_function_privilege('service_role','public.create_order_from_accepted_quote(text,text,uuid,jsonb)','execute') as old_calculator_disabled,not has_function_privilege('anon','public.save_cake_configuration(jsonb,jsonb)','execute') as public_write_denied",
    )
  ).rows[0];
  assert(Object.values(permissions).every(Boolean));
  console.log("PASS rollout permissions and retired quote calculator restriction");
  if (process.argv.includes("--check-writes")) {
    await db.query("begin");
    await db.query("set local lock_timeout='5s'");
    await db.query("set local statement_timeout='15s'");
    const area = {
      id: randomUUID(),
      name: "ROLLBACK-ONLY VERIFICATION",
      fee: 100,
      minimumOrder: 0,
      estimate: "",
      active: true,
      sortOrder: 0,
      postalCodePrefixes: ["B9Z"],
      freeDeliveryThreshold: 500,
      customerNote: "",
      sameDayEligible: false,
    };
    // Do not call the bulk-save RPC on live configuration. Verify only new uncommitted records.
    await db.query(
      "insert into public.delivery_zones(id,name,fee,minimum_order,active,postal_code_prefixes) values($1,$2,100,0,true,array['B9Z'])",
      [area.id, area.name],
    );
    const written = (
      await db.query("select fee,postal_code_prefixes from public.delivery_zones where id=$1", [area.id])
    ).rows[0];
    assert.equal(written.fee, 100);
    assert.deepEqual(written.postal_code_prefixes, ["B9Z"]);
    await db.query("savepoint invalid_prefix");
    await assert.rejects(
      db.query(
        "insert into public.delivery_zones(name,fee,minimum_order,active,postal_code_prefixes) values('ROLLBACK DUPLICATE',100,0,true,array['B9Z'])",
      ),
      /Overlapping/,
    );
    await db.query("rollback to savepoint invalid_prefix");
    const cakeId = randomUUID();
    const optionId = randomUUID();
    await db.query(
      "insert into public.cake_types(id,name,slug,lead_time_value,lead_time_unit,active,base_price,tax_class) values($1,'ROLLBACK ONLY',$2,1,'weeks',false,100,'FULL_CAKE')",
      [cakeId, `rollback-${cakeId}`],
    );
    await db.query(
      "insert into public.custom_cake_options(id,type,name,price_adjustment,active) values($1,'size','ROLLBACK ONLY',0,false)",
      [optionId],
    );
    await db.query("select public.save_cake_option_assignments($1,array[$2]::uuid[])", [cakeId, optionId]);
    assert.equal(
      (await db.query("select count(*)::int as count from public.cake_type_options where cake_type_id=$1", [cakeId]))
        .rows[0].count,
      1,
    );
    await db.query("rollback");
    assert.equal(
      (await db.query("select count(*)::int as count from public.delivery_zones where id=$1", [area.id])).rows[0].count,
      0,
    );
    console.log(
      "PASS live transactional configuration read/write, overlap constraint and option relationship; all verification records rolled back",
    );
  }
  console.log(
    "Stripe environment:",
    process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")
      ? "test"
      : process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_")
        ? "live (not used by this verification)"
        : "missing or restricted key",
  );
} catch (error) {
  await db.query("rollback").catch(() => {});
  console.error(error instanceof Error ? error.message : "Verification failed.");
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const migration = "0041_dynamic_product_packs.sql";
const sql = fs.readFileSync(`db/migrations/${migration}`, "utf8");
const client = new pg.Client({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  connectionTimeoutMillis: 15000,
});
const signatures = [
  "public.admin_save_product(uuid,jsonb,jsonb,jsonb,uuid,uuid)",
  "public.admin_duplicate_product(uuid,uuid,uuid)",
  "public.product_pack_availability(uuid[])",
];
try {
  await client.connect();
  const state = (
    await client.query(`select
    to_regprocedure('public.admin_customer_page(text,integer,integer)') is not null as prerequisite,
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='product_variants' and column_name='retired_at') as installed`)
  ).rows[0];
  console.log(
    JSON.stringify({ project: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0], ...state }),
  );
  if (!state.prerequisite) throw new Error("Migration 0040 prerequisite missing.");
  if (state.installed) throw new Error("Migration 0041 already installed; do not replay.");
  if (process.argv.includes("--apply")) {
    const folder = path.resolve(".commerce-backups", `product-packs-${new Date().toISOString().replaceAll(":", "-")}`);
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    await client.query("begin");
    await client.query(
      "set local lock_timeout='5s'; set local statement_timeout='60s'; select pg_advisory_xact_lock(hashtext('product-packs-0041'))",
    );
    const before = (
      await client.query(`select (select count(*) from public.products)::integer as products,
      (select count(*) from public.product_variants)::integer as variants,
      (select count(*) from public.orders)::integer as orders`)
    ).rows[0];
    const definitions = (
      await client.query(
        `select pg_get_functiondef(p.oid) as definition
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and p.proname=any($1::text[])`,
        [
          [
            "sync_product_stock_from_variants",
            "reserve_order_inventory",
            "commit_order_inventory",
            "release_order_inventory",
            "admin_inventory_page",
            "admin_dashboard_summary",
          ],
        ],
      )
    ).rows;
    fs.writeFileSync(
      path.join(folder, "previous-functions.sql"),
      definitions.map((row) => `${row.definition};`).join("\n\n"),
      { mode: 0o600 },
    );
    await client.query(sql.replace(/^begin;\s*/i, "").replace(/commit;\s*$/i, ""));
    const verified = [];
    for (const signature of signatures) {
      const grants = (
        await client.query(
          `select has_function_privilege('service_role',$1,'EXECUTE') as service,
        has_function_privilege('anon',$1,'EXECUTE') as anon,
        has_function_privilege('authenticated',$1,'EXECUTE') as authenticated`,
          [signature],
        )
      ).rows[0];
      if (!grants.service || grants.anon || grants.authenticated) throw new Error(`Invalid permissions: ${signature}`);
      verified.push({ signature, ...grants });
    }
    const after = (
      await client.query(`select (select count(*) from public.products)::integer as products,
      (select count(*) from public.product_variants)::integer as variants,
      (select count(*) from public.orders)::integer as orders`)
    ).rows[0];
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Record counts changed unexpectedly.");
    await client.query("select public.product_pack_availability('{}'::uuid[])");
    await client.query("set constraints all immediate");
    await client.query("notify pgrst,'reload schema'");
    await client.query("commit");
    const receipt = {
      appliedAt: new Date().toISOString(),
      migration,
      sha256: crypto.createHash("sha256").update(sql).digest("hex"),
      before,
      after,
      verified,
    };
    fs.writeFileSync(path.join(folder, "rollout.json"), JSON.stringify(receipt, null, 2), { mode: 0o600 });
    console.log(
      JSON.stringify({
        applied: true,
        ...receipt,
        receipt: path.relative(process.cwd(), path.join(folder, "rollout.json")),
      }),
    );
  } else console.log("Read-only preflight passed. Use --apply for rollout.");
} catch (reason) {
  await client.query("rollback").catch(() => {});
  console.error(reason instanceof Error ? reason.message : "Rollout failed");
  process.exitCode = 1;
} finally {
  await client.end();
}

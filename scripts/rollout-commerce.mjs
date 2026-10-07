// Explicit rollout only: node scripts/rollout-commerce.mjs --apply
// Loads credentials without logging them. Backups contain affected configuration, not customer records.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const files = ["0032_commerce_configuration.sql", "0033_quote_commerce_snapshots.sql"];
const client = new pg.Client({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  connectionTimeoutMillis: 15000,
});
let committed = false;
try {
  await client.connect();
  const existing = await client.query(
    "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='tax_class') as installed,to_regclass('public.cake_types') is not null as cake_types_exists",
  );
  if (!existing.rows[0].cake_types_exists) throw new Error("0030 prerequisite is missing.");
  if (existing.rows[0].installed)
    throw new Error("Commerce migration objects already exist; inspect rather than replay.");
  console.log("Verified configured database prerequisites; new commerce schema is not yet installed.");
  if (!process.argv.includes("--apply")) {
    console.log("Read-only preflight complete. Use --apply for the explicitly authorized rollout.");
  } else {
    const folder = path.resolve(".commerce-backups", new Date().toISOString().replaceAll(":", "-"));
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    await client.query("begin isolation level repeatable read read only");
    const backup = {
      capturedAt: new Date().toISOString(),
      scope:
        "Affected public commerce configuration and schema metadata. Customer/order/payment rows are excluded; these additive migrations do not rewrite them.",
      configuration: {},
      schema: {},
    };
    for (const table of [
      "site_settings",
      "cake_types",
      "custom_cake_options",
      "delivery_zones",
      "products",
      "product_variants",
    ]) {
      backup.configuration[table] = (await client.query(`select * from public.${table}`)).rows;
    }
    backup.schema.columns = (
      await client.query(
        "select * from information_schema.columns where table_schema='public' order by table_name,ordinal_position",
      )
    ).rows;
    backup.schema.constraints = (
      await client.query(
        "select c.conname, c.conrelid::regclass::text as relation,pg_get_constraintdef(c.oid) as definition from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'",
      )
    ).rows;
    backup.schema.indexes = (await client.query("select * from pg_indexes where schemaname='public'")).rows;
    backup.schema.functions = (
      await client.query(
        "select p.proname,pg_get_functiondef(p.oid) as definition,p.proacl::text as privileges from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'",
      )
    ).rows;
    backup.schema.triggers = (
      await client.query(
        "select t.tgname,t.tgrelid::regclass::text as relation,pg_get_triggerdef(t.oid) as definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal",
      )
    ).rows;
    await client.query("commit");
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(backup), "utf8"), cipher.final()]);
    const envelope = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
    fs.writeFileSync(path.join(folder, "configuration.aes-gcm"), envelope, { mode: 0o600 });
    fs.writeFileSync(path.join(folder, "recovery.key"), key, { mode: 0o600 });
    // Verify authentication and byte equality before making any schema changes.
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      fs.readFileSync(path.join(folder, "recovery.key")),
      envelope.subarray(0, 12),
    );
    decipher.setAuthTag(envelope.subarray(12, 28));
    const restored = JSON.parse(
      Buffer.concat([decipher.update(envelope.subarray(28)), decipher.final()]).toString("utf8"),
    );
    if (JSON.stringify(restored.configuration) !== JSON.stringify(backup.configuration))
      throw new Error("Backup verification failed.");
    console.log(`Encrypted configuration backup verified: ${folder}`);
    await client.query("begin");
    await client.query("set local lock_timeout='10s'");
    await client.query("set local statement_timeout='60s'");
    await client.query("select pg_advisory_xact_lock(hashtext('ndee-commerce-rollout'))");
    for (const name of files) {
      await client.query(
        fs
          .readFileSync(`db/migrations/${name}`, "utf8")
          .replace(/^begin;\s*$/gm, "")
          .replace(/^commit;\s*$/gm, ""),
      );
      console.log(`Applied in transaction: ${name}`);
    }
    const verified = await client.query(
      "select to_regclass('public.cake_type_options') is not null as relationships,exists(select 1 from pg_trigger where tgname='commerce_snapshot_guard' and not tgisinternal) as snapshot_guard,exists(select 1 from pg_trigger where tgname='delivery_prefixes_unique' and not tgisinternal) as prefix_guard,has_function_privilege('service_role','public.create_order_from_accepted_quote_v2(text,text,uuid,jsonb,jsonb)','execute') as quote_permission,not has_function_privilege('anon','public.save_delivery_areas(jsonb)','execute') as anonymous_write_denied",
    );
    if (Object.values(verified.rows[0]).some((value) => value !== true)) throw new Error("Schema verification failed.");
    const afterContent = (await client.query("select * from public.site_settings order by key")).rows;
    const beforeContent = [...backup.configuration.site_settings].sort((a, b) => a.key.localeCompare(b.key));
    if (JSON.stringify(afterContent) !== JSON.stringify(beforeContent))
      throw new Error("Owner settings changed during structural migration.");
    await client.query("notify pgrst,'reload schema'");
    await client.query("commit");
    committed = true;
    fs.writeFileSync(
      path.join(folder, "rollout.json"),
      JSON.stringify(
        { capturedAt: backup.capturedAt, applied: files, checks: verified.rows[0], ownerSettingsUnchanged: true },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log("Committed and verified commerce migrations; owner site settings preserved.");
  }
} catch (error) {
  if (!committed) await client.query("rollback").catch(() => {});
  console.error(error instanceof Error ? error.message : "Rollout failed.");
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

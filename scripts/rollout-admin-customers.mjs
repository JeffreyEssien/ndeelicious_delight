import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const sql = fs.readFileSync("db/migrations/0040_admin_customer_pages.sql", "utf8");
const client = new pg.Client({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  connectionTimeoutMillis: 15000,
});
try {
  await client.connect();
  const prerequisites = (
    await client.query(
      "select to_regprocedure('public.admin_history_page(text,jsonb)') is not null as history,to_regprocedure('public.admin_customer_page(text,integer,integer)') is not null as installed,current_database() as database",
    )
  ).rows[0];
  if (!prerequisites.history) throw new Error("History migration prerequisite missing.");
  console.log(
    JSON.stringify({ project: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0], ...prerequisites }),
  );
  if (prerequisites.installed) throw new Error("Customer migration already installed; do not replay.");
  if (!process.argv.includes("--apply")) {
    console.log("Read-only preflight passed. Use --apply for rollout.");
  } else {
    const folder = path.resolve(
      ".commerce-backups",
      `admin-customers-${new Date().toISOString().replaceAll(":", "-")}`,
    );
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    await client.query("begin");
    await client.query(
      "set local lock_timeout='5s'; set local statement_timeout='30s'; select pg_advisory_xact_lock(hashtext('admin-customers-0040'))",
    );
    await client.query(sql);
    const verified = (
      await client.query(
        "select has_function_privilege('service_role','public.admin_customer_page(text,integer,integer)','EXECUTE') as service,has_function_privilege('anon','public.admin_customer_page(text,integer,integer)','EXECUTE') as anon,has_function_privilege('authenticated','public.admin_customer_page(text,integer,integer)','EXECUTE') as authenticated",
      )
    ).rows[0];
    if (!verified.service || verified.anon || verified.authenticated) throw new Error("Invalid customer RPC grants.");
    const summary = (
      await client.query(
        "select jsonb_array_length(admin_customer_page()->'rows') as page_rows,(admin_customer_page()->>'total')::integer as total",
      )
    ).rows[0];
    await client.query("notify pgrst,'reload schema'");
    await client.query("commit");
    fs.writeFileSync(
      path.join(folder, "rollout.json"),
      JSON.stringify(
        {
          appliedAt: new Date().toISOString(),
          migration: "0040_admin_customer_pages.sql",
          sha256: crypto.createHash("sha256").update(sql).digest("hex"),
          verified,
          summary,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        applied: true,
        verified,
        summary,
        receipt: path.relative(process.cwd(), path.join(folder, "rollout.json")),
      }),
    );
  }
} catch (reason) {
  await client.query("rollback").catch(() => {});
  console.error(reason instanceof Error ? reason.message : "Rollout failed");
  process.exitCode = 1;
} finally {
  await client.end();
}

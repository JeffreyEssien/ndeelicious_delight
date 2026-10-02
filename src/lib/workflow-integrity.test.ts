import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "db/migrations/0027_workflow_integrity.sql"), "utf8");

describe("workflow integrity migration", () => {
  it("accepts only marked non-inventory custom-cake lines", () => {
    expect(migration).toContain("coalesce(product_snapshot->>'type', '') <> 'CUSTOM_CAKE'");
    expect(migration).toContain("oi.product_id is not null");
  });

  it("makes linked order status authoritative for a custom cake", () => {
    expect(migration).toContain("LINKED_ORDER_STATUS_AUTHORITATIVE");
    expect(migration).toContain("create trigger protect_linked_cake_status");
  });

  it("persists document presentation and quote delivery state", () => {
    expect(migration).toContain("update_document_presentation");
    expect(migration).toContain("create table if not exists public.document_deliveries");
  });
});

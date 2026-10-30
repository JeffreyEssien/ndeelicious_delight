import { describe, expect, it } from "vitest";
import { getInventoryInsights } from "./inventory-insights";

// A query builder that resolves to fixed rows per table, whatever filters are chained.
function fakeDb(rows: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const query = Promise.resolve({ data: rows[table] ?? [] }) as Promise<unknown> & Record<string, unknown>;
      for (const name of ["select", "eq", "gt", "gte", "in", "order", "limit"]) query[name] = () => query;
      return query;
    },
  };
}

describe("stock insights", () => {
  it("adds up held and sold units and keeps the latest five changes", async () => {
    const history = Array.from({ length: 7 }, (_, index) => ({
      entity_id: "a",
      previous_value: { stockQuantity: index },
      new_value: { stockQuantity: index + 1 },
      metadata: { mode: "add", reason: index === 0 ? "Baked a batch" : undefined },
      created_at: `2026-10-${String(30 - index).padStart(2, "0")}T12:00:00Z`,
      admins: { name: "Ndidi" },
    }));
    const insights = await getInventoryInsights(
      fakeDb({
        inventory_reservations: [
          { variant_id: "a", quantity: 2 },
          { variant_id: "a", quantity: 1 },
        ],
        order_items: [
          { variant_id: "a", quantity: 4 },
          { variant_id: "b", quantity: 6 },
        ],
        admin_audit_logs: history,
      }) as never,
      ["a", "b"],
    );
    expect(insights.a.held).toBe(3);
    expect(insights.a.sold30).toBe(4);
    expect(insights.b).toEqual({ held: 0, sold30: 6, history: [] });
    expect(insights.a.history).toHaveLength(5);
    expect(insights.a.history[0]).toEqual({
      at: "2026-10-30T12:00:00Z",
      from: 0,
      to: 1,
      mode: "add",
      reason: "Baked a batch",
      by: "Ndidi",
    });
  });

  it("returns nothing to look up for no variants", async () => {
    expect(await getInventoryInsights(fakeDb({}) as never, [])).toEqual({});
  });
});

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { InventoryConflictError, reserveOrderInventory, setProductInventory, transitionOrderStatus } from "./inventory";

function client(result: { data: unknown; error: null | { message: string } }) {
  return { rpc: vi.fn().mockResolvedValue(result) } as unknown as SupabaseClient;
}

describe("database inventory operations", () => {
  it("creates a fifteen-minute database reservation", async () => {
    const db = client({ data: "2026-09-23T10:00:00.000Z", error: null });

    await expect(reserveOrderInventory(db, "order-id")).resolves.toEqual(new Date("2026-09-23T10:00:00.000Z"));
    expect(db.rpc).toHaveBeenCalledWith("reserve_order_inventory", {
      p_order_id: "order-id",
      p_hold_minutes: 15,
    });
  });

  it("turns database stock races into a safe commerce conflict", async () => {
    const db = client({ data: null, error: { message: "INSUFFICIENT_STOCK" } });

    await expect(reserveOrderInventory(db, "order-id")).rejects.toBeInstanceOf(InventoryConflictError);
  });

  it("uses the atomic status transition for payment and cancellation states", async () => {
    const db = client({ data: null, error: null });

    await transitionOrderStatus(db, "ND-123", "PAID");
    expect(db.rpc).toHaveBeenCalledWith("transition_order_status", {
      p_order_number: "ND-123",
      p_status: "PAID",
    });
  });

  it("prevents an admin adjustment from consuming stock held by pending orders", async () => {
    const db = client({ data: null, error: { message: "STOCK_BELOW_RESERVED" } });

    await expect(setProductInventory(db, "product-id", 1)).rejects.toMatchObject({
      code: "STOCK_BELOW_RESERVED",
    });
  });
});

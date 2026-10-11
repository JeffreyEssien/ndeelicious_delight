import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDashboardSummary } from "./admin-dashboard";
describe("bounded dashboard data", () => {
  it("loads scalar aggregates and recent summaries through its service RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { netRevenue: 300, recentOrders: [] }, error: null });
    expect(await getDashboardSummary({ rpc } as unknown as SupabaseClient)).toMatchObject({
      netRevenue: 300,
      recentOrders: [],
    });
    expect(rpc).toHaveBeenCalledWith("admin_dashboard_summary");
  });
  it("rejects missing migrations and invalid responses", async () => {
    for (const result of [
      { data: null, error: { message: "migration missing" } },
      { data: "uuid", error: null },
    ]) {
      const rpc = vi.fn().mockResolvedValue(result);
      await expect(getDashboardSummary({ rpc } as unknown as SupabaseClient)).rejects.toThrow(
        "Dashboard could not be loaded",
      );
    }
  });
});

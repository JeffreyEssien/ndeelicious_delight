import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminOrder } from "./admin";
export type DashboardSummary = {
  netRevenue: number;
  paidOrders: number;
  averageOrderValue: number;
  revenueChange: number | null;
  returningCustomers: number;
  repeatCustomerRate: number;
  lowStockProducts: number;
  waitingQuotes: number;
  recentOrders: Array<Pick<AdminOrder, "id" | "customer" | "date" | "total" | "status" | "items" | "fulfilment">>;
};
export async function getDashboardSummary(db: SupabaseClient): Promise<DashboardSummary> {
  const { data, error } = await db.rpc("admin_dashboard_summary");
  if (error || !data || !Array.isArray(data.recentOrders) || typeof data.netRevenue !== "number")
    throw new Error("Dashboard could not be loaded. Please retry.");
  return data as DashboardSummary;
}

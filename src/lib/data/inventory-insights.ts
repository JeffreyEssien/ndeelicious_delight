import type { SupabaseClient } from "@supabase/supabase-js";

export type StockChange = {
  at: string;
  from: number | null;
  to: number | null;
  mode: string | null;
  reason: string | null;
  by: string | null;
};
export type VariantInsight = { held: number; sold30: number; history: StockChange[] };

const paidStatuses = ["PAID", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"];

/**
 * What the Stock page shows beside each count: units held for checkouts still being paid,
 * units sold in the last 30 days (for a days-left estimate) and the latest adjustments.
 */
export async function getInventoryInsights(db: SupabaseClient, variantIds: string[]) {
  const insights: Record<string, VariantInsight> = Object.fromEntries(
    variantIds.map((id) => [id, { held: 0, sold30: 0, history: [] }]),
  );
  if (!variantIds.length) return insights;
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [held, sold, history] = await Promise.all([
    db
      .from("inventory_reservations")
      .select("variant_id,quantity")
      .eq("status", "ACTIVE")
      .gt("expires_at", new Date().toISOString())
      .in("variant_id", variantIds),
    db
      .from("order_items")
      .select("variant_id,quantity,orders!inner(status,created_at)")
      .in("variant_id", variantIds)
      .gte("orders.created_at", since)
      .in("orders.status", paidStatuses),
    db
      .from("admin_audit_logs")
      .select("entity_id,previous_value,new_value,metadata,created_at,admins(name)")
      .eq("action", "INVENTORY_ADJUSTED")
      .eq("entity_type", "product_variant")
      .in("entity_id", variantIds)
      .order("created_at", { ascending: false })
      .limit(Math.min(500, variantIds.length * 6)),
  ]);
  for (const row of held.data ?? []) if (insights[row.variant_id]) insights[row.variant_id].held += row.quantity;
  for (const row of sold.data ?? []) if (insights[row.variant_id]) insights[row.variant_id].sold30 += row.quantity;
  for (const row of history.data ?? []) {
    const insight = insights[row.entity_id as string];
    if (!insight || insight.history.length >= 5) continue;
    const admin = Array.isArray(row.admins) ? row.admins[0] : row.admins;
    insight.history.push({
      at: row.created_at,
      from: (row.previous_value as { stockQuantity?: number } | null)?.stockQuantity ?? null,
      to: (row.new_value as { stockQuantity?: number } | null)?.stockQuantity ?? null,
      mode: (row.metadata as { mode?: string } | null)?.mode ?? null,
      reason: (row.metadata as { reason?: string } | null)?.reason ?? null,
      by: (admin as { name?: string } | null)?.name ?? null,
    });
  }
  return insights;
}

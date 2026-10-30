import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { z } from "zod";
import { requireAdminRequest } from "@/lib/auth/admin-request";
import { deliverPendingOrderNotifications } from "@/lib/orders/notifications";
import { type EarlyOrder, isEarly } from "@/lib/orders/notice";
const schema = z.object({
  orders: z
    .array(
      z.object({
        number: z.string().min(1).max(100),
        expectedStatus: z.enum(["PAID", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"]),
      }),
    )
    .min(1)
    .max(100),
  // Set once the admin has seen the notice-period reminder and still wants the orders marked ready.
  confirmEarly: z.boolean().optional(),
});
export async function POST(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Select up to 100 eligible orders." }, { status: 400 });
  const early = parsed.data.confirmEarly ? [] : await earlyOrders(auth.db, parsed.data.orders);
  if (early.length) return Response.json({ early }, { status: 409 });
  const results: Array<{ number: string; outcome: "successful" | "skipped" | "failed"; message: string }> = [];
  const seen = new Set<string>();
  for (const order of parsed.data.orders) {
    if (seen.has(order.number)) {
      results.push({ number: order.number, outcome: "skipped", message: "Duplicate selection." });
      continue;
    }
    seen.add(order.number);
    const { data, error } = await auth.db.rpc("admin_advance_order", {
      p_number: order.number,
      p_expected_status: order.expectedStatus,
      p_admin_id: auth.admin.id,
      p_session_id: auth.sessionId,
    });
    if (error) {
      results.push({
        number: order.number,
        outcome: "failed",
        message: "The order could not move on. Check its stock and try again.",
      });
      continue;
    }
    const skipped = ["NOT_FOUND", "CONFLICT", "INELIGIBLE"].includes(data);
    results.push({
      number: order.number,
      outcome: skipped ? "skipped" : "successful",
      message: skipped
        ? "Order changed or is no longer eligible. Refresh and review."
        : `Advanced to ${String(data).toLowerCase().replaceAll("_", " ")}.`,
    });
    if (!skipped) after(() => deliverPendingOrderNotifications(auth.db, order.number));
  }
  return Response.json({ results });
}

// Orders about to be marked ready while the customer's notice period is still running.
async function earlyOrders(
  db: SupabaseClient,
  orders: { number: string; expectedStatus: string }[],
): Promise<EarlyOrder[]> {
  const numbers = [...new Set(orders.filter((order) => order.expectedStatus === "PREPARING").map((o) => o.number))];
  if (!numbers.length) return [];
  const { data } = await db
    .from("orders")
    .select("order_number,created_at,preparation_ready_at")
    .in("order_number", numbers)
    .eq("status", "PREPARING");
  return (data ?? [])
    .filter((row) => isEarly(row.preparation_ready_at))
    .map((row) => ({ number: row.order_number, placedAt: row.created_at, readyAt: row.preparation_ready_at }));
}

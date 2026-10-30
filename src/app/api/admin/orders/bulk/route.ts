import { after } from "next/server";
import { z } from "zod";
import { requireAdminRequest } from "@/lib/auth/admin-request";
import { deliverPendingOrderNotifications } from "@/lib/orders/notifications";
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
});
export async function POST(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Select up to 100 eligible orders." }, { status: 400 });
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

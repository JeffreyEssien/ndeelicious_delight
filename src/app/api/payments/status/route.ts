import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";

const schema = z
  .string()
  .trim()
  .regex(/^cs_(test_|live_)?[A-Za-z0-9_]+$/)
  .max(255);

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session");
  const parsed = schema.safeParse(sessionId);
  if (!parsed.success) return Response.json({ error: "Invalid payment session." }, { status: 400 });

  const { data, error } = await createServiceClient()
    .from("payments")
    .select("status,provider_payload,orders!inner(order_number,status)")
    .eq("provider", "stripe")
    .eq("provider_payment_id", parsed.data)
    .maybeSingle();
  if (error || !data) return Response.json({ error: "Payment session not found." }, { status: 404 });

  const related = Array.isArray(data.orders) ? data.orders[0] : data.orders;
  const payload = (data.provider_payload ?? {}) as Record<string, unknown>;
  return Response.json(
    {
      payment: {
        status: data.status,
        orderStatus: related?.status,
        orderNumber: related?.order_number,
        checkoutUrl: data.status === "PENDING" ? payload.checkout_url : undefined,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { confirmCheckoutWithStripe } from "@/lib/payments/confirm";
import { enforcePublicRateLimit } from "@/lib/security/rate-limit";

const schema = z
  .string()
  .trim()
  .regex(/^cs_(test_|live_)?[A-Za-z0-9_]+$/)
  .max(255);

export async function GET(request: Request) {
  const limited = await enforcePublicRateLimit(request, { scope: "payment-status", maximum: 180, windowSeconds: 900 });
  if (limited) return limited;
  const sessionId = new URL(request.url).searchParams.get("session");
  const parsed = schema.safeParse(sessionId);
  if (!parsed.success) return Response.json({ error: "Invalid payment session." }, { status: 400 });

  const db = createServiceClient();
  const read = () =>
    db
      .from("payments")
      .select("status,provider_payload,orders!inner(order_number,status)")
      .eq("provider", "stripe")
      .eq("provider_payment_id", parsed.data)
      .maybeSingle();
  let { data, error } = await read();
  if (error || !data) return Response.json({ error: "Payment session not found." }, { status: 404 });
  // Still pending here: ask Stripe directly instead of waiting only for the webhook.
  let stripeSessionDone = false;
  if (data.status === "PENDING") {
    const stripe = await confirmCheckoutWithStripe(db, parsed.data);
    stripeSessionDone = stripe?.status === "complete";
    if (stripe?.paid) {
      ({ data, error } = await read());
      if (error || !data) return Response.json({ error: "Payment session not found." }, { status: 404 });
    }
  }

  const related = Array.isArray(data.orders) ? data.orders[0] : data.orders;
  const payload = (data.provider_payload ?? {}) as Record<string, unknown>;
  const expired =
    data.status === "PENDING" && typeof payload.expires_at === "number" && payload.expires_at <= Date.now() / 1000;
  return Response.json(
    {
      payment: {
        status: data.status,
        orderStatus: related?.status,
        orderNumber: related?.order_number,
        expired,
        // Once Stripe has the payment, never send the customer back to pay again.
        processing: data.status === "PENDING" && stripeSessionDone,
        checkoutUrl: data.status === "PENDING" && !expired && !stripeSessionDone ? payload.checkout_url : undefined,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

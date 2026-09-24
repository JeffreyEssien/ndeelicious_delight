import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isSameOrigin } from "@/lib/auth/validation";
import { InventoryConflictError, transitionOrderStatus } from "@/lib/data/inventory";
import { createStripeCheckout, expireStripeCheckout, PaymentConfigurationError } from "@/lib/payments/stripe";
import { createServiceClient } from "@/lib/supabase/service";

const schema = z.object({ sessionId: z.string().trim().regex(/^cs_(test_|live_)?[A-Za-z0-9_]+$/).max(255) });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid payment session." }, { status: 400 });

  const service = createServiceClient();
  const { data, error } = await service
    .from("payments")
    .select("order_id,status,provider_payload,orders!inner(order_number,email,grand_total,currency,status)")
    .eq("provider", "stripe")
    .eq("provider_payment_id", parsed.data.sessionId)
    .maybeSingle();
  if (error || !data) return Response.json({ error: "Payment session not found." }, { status: 404 });
  const order = Array.isArray(data.orders) ? data.orders[0] : data.orders;
  if (!order) return Response.json({ error: "Order not found." }, { status: 404 });
  const previousPayload = (data.provider_payload ?? {}) as Record<string, unknown>;
  if (data.status === "PENDING" && typeof previousPayload.checkout_url === "string") {
    return Response.json({ payment: { checkoutUrl: previousPayload.checkout_url } });
  }
  if (data.status === "SUCCEEDED" || order.status === "PAID") {
    return Response.json({ error: "This order is already paid." }, { status: 409 });
  }

  let sessionId: string | undefined;
  try {
    const { error: prepareError } = await service.rpc("prepare_order_payment_retry", {
      p_order_id: data.order_id,
      p_hold_minutes: 60,
    });
    if (prepareError) throw prepareError;
    const attemptKey = `checkout:${data.order_id}:${randomUUID()}`;
    const checkout = await createStripeCheckout({
      orderId: data.order_id,
      orderNumber: order.order_number,
      email: order.email,
      amount: order.grand_total,
      currency: order.currency,
      attemptKey,
    });
    sessionId = checkout.id;
    const { error: insertError } = await service.from("payments").insert({
      order_id: data.order_id,
      provider: "stripe",
      provider_payment_id: checkout.id,
      status: "PENDING",
      amount: order.grand_total,
      currency: order.currency,
      idempotency_key: attemptKey,
      provider_payload: { checkout_session_id: checkout.id, checkout_url: checkout.url, expires_at: checkout.expiresAt },
    });
    if (insertError) throw insertError;
    return Response.json({ payment: { checkoutUrl: checkout.url } });
  } catch (reason) {
    if (sessionId) await expireStripeCheckout(sessionId);
    await transitionOrderStatus(service, order.order_number, "FAILED").catch(() => undefined);
    if (reason instanceof PaymentConfigurationError)
      return Response.json({ error: reason.message, code: "PAYMENT_UNAVAILABLE" }, { status: 503 });
    if (reason instanceof InventoryConflictError)
      return Response.json({ error: reason.message, code: reason.code }, { status: 409 });
    return Response.json({ error: "We couldn’t restart this payment. Please try again." }, { status: 500 });
  }
}

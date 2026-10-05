import { z } from "zod";
import { isSameOrigin } from "@/lib/auth/validation";
import { hashDocumentToken } from "@/lib/documents/tokens";
import { createStripeCheckout, PaymentConfigurationError } from "@/lib/payments/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { enforcePublicRateLimit } from "@/lib/security/rate-limit";

const postalCode = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;
const schema = z.object({
  token: z.string().min(32).max(200),
  delivery: z.discriminatedUnion("fulfilment", [
    z.object({ fulfilment: z.literal("pickup") }),
    z.object({
      fulfilment: z.literal("delivery"),
      zoneId: z.uuid(),
      street: z.string().trim().min(5),
      addressLine2: z.string().trim().max(120).optional(),
      city: z.string().trim().min(2),
      province: z.string().trim().length(2),
      postalCode: z.string().trim().regex(postalCode),
      notes: z.string().trim().max(500).optional(),
    }),
  ]),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const limited = await enforcePublicRateLimit(request, { scope: "quote-checkout", maximum: 10, windowSeconds: 3600 });
  if (limited) return limited;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Check your fulfilment details." },
      { status: 400 },
    );
  const db = createServiceClient();
  const delivery = parsed.data.delivery;
  const address =
    delivery.fulfilment === "delivery"
      ? {
          street: delivery.street,
          addressLine2: delivery.addressLine2 ?? "",
          city: delivery.city,
          province: delivery.province.toUpperCase(),
          postalCode: delivery.postalCode.toUpperCase(),
          country: "CA",
          instructions: delivery.notes ?? "",
        }
      : null;
  const { data, error } = await db.rpc("create_order_from_accepted_quote", {
    p_token_hash: hashDocumentToken(parsed.data.token),
    p_fulfilment: delivery.fulfilment,
    p_delivery_zone_id: delivery.fulfilment === "delivery" ? delivery.zoneId : null,
    p_address: address,
  });
  if (error || !data)
    return Response.json(
      { error: "We could not prepare this order. Please check the details and try again." },
      { status: 409 },
    );
  const existing = await db
    .from("payments")
    .select("provider_payload,status")
    .eq("order_id", data.orderId)
    .eq("provider", "stripe")
    .in("status", ["PENDING", "SUCCEEDED"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const existingUrl = existing.data?.provider_payload?.checkout_url;
  if (existing.data?.status === "PENDING" && typeof existingUrl === "string")
    return Response.json({ checkoutUrl: existingUrl, orderNumber: data.orderNumber, total: data.total });
  try {
    const checkout = await createStripeCheckout({
      orderId: data.orderId,
      orderNumber: data.orderNumber,
      email: data.email,
      amount: data.total,
      currency: data.currency,
      attemptKey: `custom-quote:${data.orderId}:initial`,
    });
    const payment = await db.from("payments").upsert(
      {
        order_id: data.orderId,
        provider: "stripe",
        provider_payment_id: checkout.id,
        status: "PENDING",
        amount: data.total,
        currency: data.currency,
        idempotency_key: `checkout:${data.orderId}:initial`,
        provider_payload: {
          checkout_session_id: checkout.id,
          checkout_url: checkout.url,
          expires_at: checkout.expiresAt,
        },
      },
      { onConflict: "idempotency_key" },
    );
    if (payment.error) throw payment.error;
    return Response.json({ checkoutUrl: checkout.url, orderNumber: data.orderNumber, total: data.total });
  } catch (reason) {
    if (reason instanceof PaymentConfigurationError) return Response.json({ error: reason.message }, { status: 503 });
    return Response.json({ error: "Payment could not be started. Please try again." }, { status: 500 });
  }
}

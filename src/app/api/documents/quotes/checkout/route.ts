import { z } from "zod";
import { deliverySchema } from "@/validations/checkout";
import { resolveAccessToken } from "@/lib/documents/service";
import { getBusinessSettings, getCakeConfiguration } from "@/lib/data/settings";
import { getDeliveryZones } from "@/lib/data/catalog";
import { resolveCheckoutFulfilment } from "@/features/fulfilment/checkout";
import { FulfilmentError } from "@/features/fulfilment/types";
import { calculateLineTaxes } from "@/features/tax/calculator";
import { leadTimeHours } from "@/features/cakes/lead-time";
import { assertFulfilmentAvailable } from "@/features/checkout/pricing";
import { isSameOrigin } from "@/lib/auth/validation";
import { hashDocumentToken } from "@/lib/documents/tokens";
import { createStripeCheckout, PaymentConfigurationError } from "@/lib/payments/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { enforcePublicRateLimit } from "@/lib/security/rate-limit";

const schema = z.object({ token: z.string().min(32).max(200), delivery: deliverySchema });

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
  let pricing: {
    subtotal: number;
    deliveryFee: number;
    taxTotal: number;
    grandTotal: number;
    taxSnapshot: ReturnType<typeof calculateLineTaxes>;
    fulfilment: ReturnType<typeof resolveCheckoutFulfilment>;
  };
  let resolvedAreaId: string | null = null;
  try {
    const document = await resolveAccessToken(db, parsed.data.token);
    if (document?.kind !== "QUOTE" || document.state !== "ACCEPTED" || !document.cake_order_id)
      return Response.json({ error: "This accepted quote is unavailable." }, { status: 409 });
    const cake = await db
      .from("custom_cake_orders")
      .select("cake_type_id,lead_time_snapshot,requested_date,order_id")
      .eq("id", document.cake_order_id)
      .single();
    if (cake.error || !cake.data) throw new Error("Cake request is unavailable.");
    if (cake.data.order_id) {
      const previous = await db
        .from("orders")
        .select("id,order_number,grand_total,email,currency,status")
        .eq("id", cake.data.order_id)
        .single();
      if (previous.error || !previous.data) throw new Error("The recorded order is unavailable.");
      if (previous.data.status !== "PENDING_PAYMENT")
        return Response.json({ error: "This order is no longer awaiting payment." }, { status: 409 });
      return startQuotePayment(db, {
        orderId: previous.data.id,
        orderNumber: previous.data.order_number,
        total: previous.data.grand_total,
        email: previous.data.email,
        currency: previous.data.currency,
      });
    }
    const [business, areas, configuration] = await Promise.all([
      getBusinessSettings(db),
      getDeliveryZones(db),
      getCakeConfiguration(db),
    ]);
    assertFulfilmentAvailable({ fulfilment: delivery.fulfilment, ...business });
    const type = configuration.cakeTypes.find((item) => item.id === cake.data.cake_type_id);
    if (!type) throw new Error("Cake tax classification setup is required.");
    const subtotal = document.totals_snapshot.total;
    const lead = cake.data.lead_time_snapshot;
    const fulfilment = resolveCheckoutFulfilment({
      delivery,
      areas,
      subtotal,
      preparationHours: 0,
      cakeLeadTimeHours: lead ? leadTimeHours(lead) : leadTimeHours(type),
      schedule: business.fulfilmentSchedule ?? null,
    });
    if (!cake.data.order_id && business.fulfilmentSchedule) {
      const schedule = business.fulfilmentSchedule;
      const day = new Date(`${cake.data.requested_date}T12:00:00Z`).getUTCDay();
      const days = delivery.fulfilment === "delivery" ? schedule.deliveryDays : schedule.pickupDays;
      if (
        !days.includes(day) ||
        schedule.blackouts.some((entry) => entry.active && entry.date === cake.data.requested_date)
      )
        throw new FulfilmentError(
          "CAKE_DATE_UNAVAILABLE",
          "This date is unavailable for the selected fulfilment method. Contact the bakery to update your quote.",
        );
    }
    if (!cake.data.order_id && cake.data.requested_date < fulfilment.date)
      throw new FulfilmentError(
        "CAKE_DATE_UNAVAILABLE",
        `The earliest available date is ${fulfilment.date}. Contact the bakery to update your quote.`,
      );
    resolvedAreaId = fulfilment.area?.id ?? null;
    const taxSnapshot = calculateLineTaxes({
      lines: [
        {
          id: document.cake_order_id,
          grossAmount: subtotal,
          taxClass: type.taxClass ?? "REQUIRES_REVIEW",
          packQuantity: null,
          discountEligible: false,
        },
      ],
      discount: 0,
      deliveryFee: fulfilment.fee,
      deliveryTaxMode: business.deliveryTaxMode ?? null,
      enabled: business.taxEnabled,
    });
    pricing = {
      subtotal,
      deliveryFee: fulfilment.fee,
      taxTotal: taxSnapshot.total,
      grandTotal: subtotal + fulfilment.fee + taxSnapshot.total,
      taxSnapshot,
      fulfilment,
    };
  } catch (reason) {
    return Response.json(
      { error: reason instanceof Error ? reason.message : "Fulfilment setup is required." },
      { status: 400 },
    );
  }
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
  const { data, error } = await db.rpc("create_order_from_accepted_quote_v2", {
    p_token_hash: hashDocumentToken(parsed.data.token),
    p_fulfilment: delivery.fulfilment,
    p_delivery_zone_id: resolvedAreaId,
    p_pricing: pricing,
    p_address: address,
  });
  if (error || !data)
    return Response.json(
      { error: "We could not prepare this order. Please check the details and try again." },
      { status: 409 },
    );
  return startQuotePayment(db, data);
}
async function startQuotePayment(
  db: ReturnType<typeof createServiceClient>,
  data: { orderId: string; orderNumber: string; total: number; email: string; currency: string },
) {
  const existing = await db
    .from("payments")
    .select("provider_payload,status")
    .eq("order_id", data.orderId)
    .eq("provider", "stripe")
    .in("status", ["PENDING", "SUCCEEDED"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.data?.status === "SUCCEEDED")
    return Response.json({ error: "This order has already been paid." }, { status: 409 });
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

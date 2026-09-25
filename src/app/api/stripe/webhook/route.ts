import type Stripe from "stripe";
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { constructStripeEvent } from "@/lib/payments/stripe";
import { processStripeCheckoutEvent } from "@/lib/data/payments";
import { deliverPendingOrderNotifications, sendPaidOrderAdminNotification } from "@/lib/orders/notifications";

const handledEvents = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "refund.created",
  "refund.updated",
  "refund.failed",
]);

function paymentIntentId(value: Stripe.Checkout.Session["payment_intent"]) {
  return typeof value === "string" ? value : (value?.id ?? "");
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing Stripe signature." }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = constructStripeEvent(await request.text(), signature);
  } catch {
    return Response.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  if (!handledEvents.has(event.type)) return Response.json({ received: true });
  if (event.type.startsWith("refund.")) {
    const refund = event.data.object as Stripe.Refund;
    if (refund.object !== "refund" || !refund.status)
      return Response.json({ error: "Invalid Stripe refund." }, { status: 400 });
    try {
      const service = createServiceClient();
      const { data, error } = await service.rpc("process_stripe_refund_event", {
        p_event_id: event.id,
        p_event_type: event.type,
        p_provider_refund_id: refund.id,
        p_refund_status: refund.status,
        p_failure_reason: refund.failure_reason ?? null,
      });
      if (error) throw error;
      if (refund.status === "succeeded" && data?.orderNumber)
        after(() => deliverPendingOrderNotifications(service, data.orderNumber));
      return Response.json({ received: true });
    } catch (error) {
      console.error("Stripe refund webhook processing failed", error instanceof Error ? error.message : "unknown");
      return Response.json({ error: "Webhook processing failed." }, { status: 500 });
    }
  }
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.object !== "checkout.session" || session.amount_total === null || !session.currency) {
    return Response.json({ error: "Invalid Checkout Session." }, { status: 400 });
  }
  if (!session.metadata?.order_id) return Response.json({ received: true });

  try {
    const result = await processStripeCheckoutEvent(createServiceClient(), {
      eventId: event.id,
      eventType: event.type,
      sessionId: session.id,
      paymentIntentId: paymentIntentId(session.payment_intent),
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
      currency: session.currency,
    });
    if (result.becamePaid && result.orderNumber) {
      after(async () => {
        const service = createServiceClient();
        await deliverPendingOrderNotifications(service, result.orderNumber as string);
        await sendPaidOrderAdminNotification(service, result.orderNumber as string);
      });
    }
    return Response.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}

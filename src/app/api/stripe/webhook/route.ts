import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { constructStripeEvent } from "@/lib/payments/stripe";
import { processStripeCheckoutEvent } from "@/lib/data/payments";
import { emailFrame, escapeHtml, sendTransactionalEmail } from "@/lib/email/mailer";

const handledEvents = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
]);

function paymentIntentId(value: Stripe.Checkout.Session["payment_intent"]) {
  return typeof value === "string" ? value : value?.id ?? "";
}

async function sendPaidNotifications(orderId: string) {
  const { data: order, error } = await createServiceClient()
    .from("orders")
    .select("customer_name,email,order_number,order_items(product_name,variant_name,quantity)")
    .eq("id", orderId)
    .single();
  if (error || !order) return;
  const items = order.order_items ?? [];
  const summary = items
    .map(
      (item) =>
        `<li>${escapeHtml(item.product_name)} · ${escapeHtml(item.variant_name ?? "Standard")} × ${item.quantity}</li>`,
    )
    .join("");
  const adminEmail = process.env.ADMIN_EMAIL;
  await Promise.all([
    sendTransactionalEmail({
      to: order.email,
      subject: `Payment confirmed for ${order.order_number}`,
      html: emailFrame(
        "Payment confirmed",
        `<p>Thank you, ${escapeHtml(order.customer_name)}. Payment for order <b>${escapeHtml(order.order_number)}</b> is confirmed.</p><ul>${summary}</ul><p>We’ll send another update as your order moves through the bakery.</p>`,
      ),
    }),
    adminEmail
      ? sendTransactionalEmail({
          to: adminEmail,
          subject: `Paid order ${order.order_number}`,
          html: emailFrame(
            "A paid order is ready to prepare",
            `<p>${escapeHtml(order.customer_name)} paid for order <b>${escapeHtml(order.order_number)}</b>.</p><ul>${summary}</ul>`,
          ),
        })
      : Promise.resolve({ sent: false }),
  ]);
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
    if (result.becamePaid && result.orderId) await sendPaidNotifications(result.orderId);
    return Response.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}

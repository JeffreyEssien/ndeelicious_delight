import Stripe from "stripe";
import { getSiteUrl } from "@/lib/site-url";

export class PaymentConfigurationError extends Error {
  constructor(message = "Online payment is temporarily unavailable. Please try again later.") {
    super(message);
    this.name = "PaymentConfigurationError";
  }
}

function stripeClient() {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) throw new PaymentConfigurationError();
  return new Stripe(secret);
}

export type CheckoutPayment = {
  orderId: string;
  orderNumber: string;
  email: string;
  amount: number;
  currency: string;
  attemptKey?: string;
};

export async function createStripeCheckout(input: CheckoutPayment) {
  const siteUrl = getSiteUrl();
  const session = await stripeClient().checkout.sessions.create(
    {
      // Checkout Studio settings: an embedded payment form on our own /pay page.
      ui_mode: "form",
      billing_address_collection: "auto",
      phone_number_collection: { enabled: false },
      automatic_tax: { enabled: false },
      submit_type: "auto",
      integration_identifier: "custom_embedded_web_0001",
      mode: "payment",
      customer_email: input.email,
      client_reference_id: input.orderId,
      metadata: { order_id: input.orderId, order_number: input.orderNumber },
      payment_intent_data: { metadata: { order_id: input.orderId, order_number: input.orderNumber } },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: input.amount,
            product_data: { name: `Ndeeelicious Delight order ${input.orderNumber}` },
          },
        },
      ],
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      return_url: `${siteUrl}/order-success?session_id={CHECKOUT_SESSION_ID}`,
    },
    { idempotencyKey: input.attemptKey ?? `checkout:${input.orderId}:initial` },
  );
  if (!session.client_secret) throw new Error("Stripe did not return a checkout client secret.");
  // The form is embedded on our own payment page, so that page is where customers go to pay.
  return {
    id: session.id,
    url: paymentEntryUrl(session.id),
    clientSecret: session.client_secret,
    expiresAt: session.expires_at,
  };
}

export async function expireStripeCheckout(sessionId: string) {
  try {
    await stripeClient().checkout.sessions.expire(sessionId);
  } catch {
    // Cleanup is best-effort; the signed webhook remains authoritative.
  }
}

export async function createStripeRefund(input: {
  paymentIntentId: string;
  amount: number;
  reason: string;
  idempotencyKey: string;
}) {
  const refund = await stripeClient().refunds.create(
    {
      payment_intent: input.paymentIntentId,
      amount: input.amount,
      reason: "requested_by_customer",
      metadata: { internal_reason: input.reason.slice(0, 500) },
    },
    { idempotencyKey: `refund:${input.idempotencyKey}` },
  );
  return { id: refund.id, status: refund.status ?? "pending" };
}

export function constructStripeEvent(payload: string, signature: string) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) throw new PaymentConfigurationError("Stripe webhook verification is not configured.");
  return stripeClient().webhooks.constructEvent(payload, signature, webhookSecret);
}

export type StripeCheckoutEvent = Stripe.Checkout.Session;

// A stored checkout URL is not evidence that its session is still payable.
export async function retrieveStripeCheckout(sessionId: string) {
  const session = await stripeClient().checkout.sessions.retrieve(sessionId);
  return {
    id: session.id,
    status: session.status,
    paymentStatus: session.payment_status,
    url: session.status === "open" ? paymentEntryUrl(session.id) : null,
    clientSecret: session.client_secret,
    expiresAt: session.expires_at,
    amountTotal: session.amount_total,
    currency: session.currency,
    paymentIntentId:
      typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? ""),
  };
}
export function paymentEntryUrl(sessionId: string) {
  return `${getSiteUrl()}/pay?session=${encodeURIComponent(sessionId)}`;
}

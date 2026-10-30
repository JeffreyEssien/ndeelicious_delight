import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { invalidateStorefrontCache } from "@/lib/cache/storefront";
import { processStripeCheckoutEvent } from "@/lib/data/payments";
import { logError, logInfo } from "@/lib/observability/log";
import { deliverPendingOrderNotifications, sendPaidOrderAdminNotification } from "@/lib/orders/notifications";
import { retrieveStripeCheckout } from "@/lib/payments/stripe";
import { createServiceClient } from "@/lib/supabase/service";

/** What happens once, whichever path (webhook or direct check) confirms the payment first. */
export function afterOrderPaid(orderNumber: string, source: string) {
  logInfo("stripe.payment_completed", { orderNumber, eventType: source });
  after(async () => {
    const service = createServiceClient();
    await deliverPendingOrderNotifications(service, orderNumber);
    await sendPaidOrderAdminNotification(service, orderNumber);
  });
}

/**
 * Asks Stripe directly whether a still-pending Checkout Session was paid, and records it if so.
 * The webhook stays the main path; this covers a webhook that is late, misconfigured or lost,
 * so a customer who has paid is never left waiting. Returns what Stripe said.
 */
export async function confirmCheckoutWithStripe(db: SupabaseClient, sessionId: string) {
  try {
    const session = await retrieveStripeCheckout(sessionId);
    const paid =
      session.status === "complete" &&
      (session.paymentStatus === "paid" || session.paymentStatus === "no_payment_required");
    if (paid && session.amountTotal !== null && session.currency) {
      // A fixed event id: the database records it once, and only a pending payment becomes paid.
      const result = await processStripeCheckoutEvent(db, {
        eventId: `confirm:${session.id}`,
        eventType: "checkout.session.completed",
        sessionId: session.id,
        paymentIntentId: session.paymentIntentId,
        paymentStatus: session.paymentStatus,
        amountTotal: session.amountTotal,
        currency: session.currency,
      });
      if (result.processed) invalidateStorefrontCache();
      if (result.becamePaid && result.orderNumber) afterOrderPaid(result.orderNumber, "direct-confirmation");
    }
    return { status: session.status, paid };
  } catch (error) {
    logError("stripe.direct_confirmation_failed", error, { sessionId });
    return null;
  }
}

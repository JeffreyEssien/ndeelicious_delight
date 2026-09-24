import type { SupabaseClient } from "@supabase/supabase-js";

export type ProcessedPaymentEvent = {
  processed: boolean;
  becamePaid: boolean;
  orderId?: string;
  orderNumber?: string;
};

export async function processStripeCheckoutEvent(
  db: SupabaseClient,
  input: {
    eventId: string;
    eventType: string;
    sessionId: string;
    paymentIntentId: string;
    paymentStatus: string;
    amountTotal: number;
    currency: string;
  },
) {
  const { data, error } = await db.rpc("process_stripe_checkout_event", {
    p_event_id: input.eventId,
    p_event_type: input.eventType,
    p_session_id: input.sessionId,
    p_payment_intent_id: input.paymentIntentId,
    p_payment_status: input.paymentStatus,
    p_amount_total: input.amountTotal,
    p_currency: input.currency,
    p_provider_payload: {
      checkout_session_id: input.sessionId,
      payment_intent_id: input.paymentIntentId,
      payment_status: input.paymentStatus,
    },
  });
  if (error) throw error;
  return data as ProcessedPaymentEvent;
}

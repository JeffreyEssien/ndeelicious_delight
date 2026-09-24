import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { processStripeCheckoutEvent } from "./payments";

describe("Stripe payment database operations", () => {
  it("passes verified payment facts to one atomic database function", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { processed: true, becamePaid: true }, error: null });
    const result = await processStripeCheckoutEvent({ rpc } as unknown as SupabaseClient, {
      eventId: "evt_123",
      eventType: "checkout.session.completed",
      sessionId: "cs_test_123",
      paymentIntentId: "pi_123",
      paymentStatus: "paid",
      amountTotal: 250_000,
      currency: "ngn",
    });

    expect(result).toEqual({ processed: true, becamePaid: true });
    expect(rpc).toHaveBeenCalledWith(
      "process_stripe_checkout_event",
      expect.objectContaining({
        p_event_id: "evt_123",
        p_session_id: "cs_test_123",
        p_amount_total: 250_000,
        p_currency: "ngn",
      }),
    );
  });

  it("propagates database failures so Stripe retries the webhook", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "PAYMENT_AMOUNT_MISMATCH" } });
    await expect(
      processStripeCheckoutEvent({ rpc } as unknown as SupabaseClient, {
        eventId: "evt_123",
        eventType: "checkout.session.completed",
        sessionId: "cs_test_123",
        paymentIntentId: "pi_123",
        paymentStatus: "paid",
        amountTotal: 1,
        currency: "ngn",
      }),
    ).rejects.toMatchObject({ message: "PAYMENT_AMOUNT_MISMATCH" });
  });
});

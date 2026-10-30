import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[],
  retrieve: vi.fn(),
  rpc: vi.fn(),
  after: vi.fn(),
}));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/security/rate-limit", () => ({ enforcePublicRateLimit: async () => null }));
vi.mock("@/lib/cache/storefront", () => ({ invalidateStorefrontCache: vi.fn() }));
vi.mock("@/lib/payments/stripe", () => ({ retrieveStripeCheckout: mocks.retrieve }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: mocks.rows.shift() }) };
    return { from: () => query, rpc: mocks.rpc };
  },
}));

import { GET } from "./route";

const pending = {
  status: "PENDING",
  provider_payload: { checkout_url: "https://checkout.stripe.com/c/pay/cs_test_abc" },
  orders: { order_number: "ND-79213152", status: "PENDING_PAYMENT" },
};
const succeeded = { ...pending, status: "SUCCEEDED", orders: { order_number: "ND-79213152", status: "PAID" } };
const session = (status: string, paymentStatus: string) => ({
  id: "cs_test_abc",
  status,
  paymentStatus,
  amountTotal: 2499,
  currency: "cad",
  paymentIntentId: "pi_123",
});
const check = async () => (await GET(new Request("http://localhost/api/payments/status?session=cs_test_abc"))).json();

describe("GET /api/payments/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rows.length = 0;
  });

  it("confirms a paid session with Stripe when the webhook hasn't arrived", async () => {
    mocks.rows.push(pending, succeeded);
    mocks.retrieve.mockResolvedValue(session("complete", "paid"));
    mocks.rpc.mockResolvedValue({
      data: { processed: true, becamePaid: true, orderNumber: "ND-79213152" },
      error: null,
    });
    const { payment } = await check();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "process_stripe_checkout_event",
      expect.objectContaining({
        p_event_id: "confirm:cs_test_abc",
        p_event_type: "checkout.session.completed",
        p_payment_status: "paid",
        p_amount_total: 2499,
      }),
    );
    expect(payment).toMatchObject({ status: "SUCCEEDED", orderNumber: "ND-79213152" });
    expect(payment.checkoutUrl).toBeUndefined();
    expect(mocks.after).toHaveBeenCalledOnce();
  });

  it("keeps the checkout link while the customer hasn't paid yet", async () => {
    mocks.rows.push(pending);
    mocks.retrieve.mockResolvedValue(session("open", "unpaid"));
    const { payment } = await check();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(payment).toMatchObject({ status: "PENDING", processing: false });
    expect(payment.checkoutUrl).toContain("checkout.stripe.com");
  });

  it("never offers checkout again once Stripe has the payment", async () => {
    mocks.rows.push(pending);
    mocks.retrieve.mockResolvedValue(session("complete", "unpaid"));
    const { payment } = await check();
    expect(payment).toMatchObject({ status: "PENDING", processing: true });
    expect(payment.checkoutUrl).toBeUndefined();
  });

  it("still answers when Stripe can't be reached", async () => {
    mocks.rows.push(pending);
    mocks.retrieve.mockRejectedValue(new Error("Stripe down"));
    const { payment } = await check();
    expect(payment.status).toBe("PENDING");
  });

  it("doesn't call Stripe for a payment that is already settled", async () => {
    mocks.rows.push(succeeded);
    await check();
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });
});

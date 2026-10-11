import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  create: vi.fn(),
  original: vi.fn(),
  latest: vi.fn(),
  retire: vi.fn(),
  save: vi.fn(),
  prepare: vi.fn(),
}));
vi.mock("@/lib/security/rate-limit", () => ({ enforcePublicRateLimit: () => null }));
vi.mock("@/lib/payments/stripe", () => ({
  retrieveStripeCheckout: mocks.session,
  createStripeCheckout: mocks.create,
  expireStripeCheckout: vi.fn(),
  PaymentConfigurationError: class extends Error {},
}));
vi.mock("@/lib/data/inventory", () => ({
  transitionOrderStatus: vi.fn(),
  InventoryConflictError: class extends Error {},
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc: mocks.prepare,
    from: () => {
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "order", "limit"]) query[method] = () => query;
      query.maybeSingle = () => mocks.original();
      query.order = () => {
        query.maybeSingle = () => mocks.latest();
        return query;
      };
      query.update = () => {
        query.eq = () => ({ eq: mocks.retire });
        return query;
      };
      query.upsert = mocks.save;
      return query;
    },
  }),
}));
import { POST } from "./route";
const request = () =>
  new Request("http://localhost/api/payments/retry", {
    method: "POST",
    body: JSON.stringify({ sessionId: "cs_test_old" }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.original.mockResolvedValue({
    data: {
      order_id: "order",
      status: "PENDING",
      orders: {
        order_number: "ND-1",
        status: "PENDING_PAYMENT",
        email: "buyer@example.invalid",
        grand_total: 1500,
        currency: "CAD",
      },
    },
  });
  mocks.latest.mockResolvedValue({ data: { status: "PENDING", provider_payment_id: "cs_test_current" } });
  mocks.prepare.mockResolvedValue({ error: null });
  mocks.retire.mockResolvedValue({ error: null });
  mocks.save.mockResolvedValue({ error: null });
  mocks.create.mockResolvedValue({
    id: "cs_test_new",
    url: "https://checkout.stripe.com/new",
    expiresAt: Date.now() / 1000 + 1800,
  });
});
describe("email payment renewal", () => {
  it("reuses only a Stripe-confirmed open session from the latest attempt", async () => {
    mocks.session.mockResolvedValue({
      status: "open",
      paymentStatus: "unpaid",
      url: "https://checkout.stripe.com/current",
      expiresAt: Date.now() / 1000 + 100,
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.session).toHaveBeenCalledWith("cs_test_current");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("retires an expired attempt, reacquires stock and creates a deduplicated replacement", async () => {
    mocks.session.mockResolvedValue({ status: "expired", paymentStatus: "unpaid" });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.retire).toHaveBeenCalled();
    expect(mocks.prepare).toHaveBeenCalledWith("prepare_order_payment_retry", {
      p_order_id: "order",
      p_hold_minutes: 60,
    });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1500, attemptKey: "checkout:order:renew:cs_test_current" }),
    );
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ status: "PENDING" }), {
      onConflict: "idempotency_key",
      ignoreDuplicates: true,
    });
  });
  it("never renews a completed session while its webhook is pending", async () => {
    mocks.session.mockResolvedValue({ status: "complete", paymentStatus: "paid" });
    expect((await POST(request())).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("rejects cancelled and already-paid orders before contacting Stripe", async () => {
    for (const status of ["PAID", "CANCELLED", "REFUNDED", "PREPARING"]) {
      mocks.original.mockResolvedValue({ data: { status: "PENDING", orders: { status } } });
      expect((await POST(request())).status).toBe(409);
    }
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("does not create another session when Stripe cannot confirm the old one", async () => {
    mocks.session.mockRejectedValue(new Error("network"));
    expect((await POST(request())).status).toBe(500);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

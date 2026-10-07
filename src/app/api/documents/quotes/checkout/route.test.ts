import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ order: vi.fn(), settings: vi.fn(), payment: vi.fn(), createCheckout: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({ enforcePublicRateLimit: () => null }));
vi.mock("@/lib/documents/service", () => ({
  resolveAccessToken: () => ({ kind: "QUOTE", state: "ACCEPTED", cake_order_id: "cake" }),
}));
vi.mock("@/lib/data/settings", () => ({ getBusinessSettings: mocks.settings, getCakeConfiguration: mocks.settings }));
vi.mock("@/lib/data/catalog", () => ({ getDeliveryZones: mocks.settings }));
vi.mock("@/lib/payments/stripe", () => ({
  createStripeCheckout: mocks.createCheckout,
  PaymentConfigurationError: class extends Error {},
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "custom_cake_orders")
        return { select: () => ({ eq: () => ({ single: () => ({ data: { order_id: "historical" } }) }) }) };
      if (table === "orders") return { select: () => ({ eq: () => ({ single: mocks.order }) }) };
      if (table === "payments")
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ in: () => ({ order: () => ({ limit: () => ({ maybeSingle: mocks.payment }) }) }) }),
            }),
          }),
          upsert: () => ({ error: null }),
        };
      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));
import { POST } from "./route";
const request = () =>
  new Request("http://localhost/api/documents/quotes/checkout", {
    method: "POST",
    body: JSON.stringify({ token: "a".repeat(64), delivery: { fulfilment: "pickup" } }),
  });
describe("accepted quote payment snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.order.mockResolvedValue({
      data: {
        id: "historical",
        order_number: "ND-OLD",
        grand_total: 12345,
        email: "buyer@example.invalid",
        currency: "CAD",
        status: "PENDING_PAYMENT",
      },
    });
    mocks.settings.mockRejectedValue(new Error("Current configuration is missing."));
    mocks.payment.mockResolvedValue({ data: null });
    mocks.createCheckout.mockResolvedValue({
      id: "session",
      url: "https://checkout.example.invalid",
      expiresAt: 9999999,
    });
  });
  it("retries an existing order using its recorded total without recalculating rules", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.settings).not.toHaveBeenCalled();
    expect(mocks.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 12345, orderId: "historical" }),
    );
  });
  it("returns an existing pending checkout and rejects another payment after success", async () => {
    mocks.payment.mockResolvedValue({
      data: { status: "PENDING", provider_payload: { checkout_url: "https://checkout.example.invalid/existing" } },
    });
    expect((await (await POST(request())).json()).checkoutUrl).toContain("existing");
    expect(mocks.createCheckout).not.toHaveBeenCalled();
    mocks.payment.mockResolvedValue({ data: { status: "SUCCEEDED" } });
    expect((await POST(request())).status).toBe(409);
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });
});

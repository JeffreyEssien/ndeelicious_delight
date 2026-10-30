import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), retrieve: vi.fn() }));
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create: mocks.create, retrieve: mocks.retrieve } };
  },
}));

import { createStripeCheckout, retrieveStripeCheckout } from "./stripe";

describe("Stripe Checkout Session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://shop.example");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("creates an embedded form session with the Checkout Studio settings and the real order", async () => {
    mocks.create.mockResolvedValue({
      id: "cs_test_abc",
      client_secret: "cs_test_abc_secret_x",
      expires_at: 1900000000,
    });
    const checkout = await createStripeCheckout({
      orderId: "order-1",
      orderNumber: "ND-1001",
      email: "ada@example.test",
      amount: 5472,
      currency: "CAD",
    });
    const [params, options] = mocks.create.mock.calls[0];
    expect(params).toMatchObject({
      ui_mode: "form",
      billing_address_collection: "auto",
      phone_number_collection: { enabled: false },
      automatic_tax: { enabled: false },
      submit_type: "auto",
      integration_identifier: "custom_embedded_web_0001",
      mode: "payment",
      line_items: [{ quantity: 1, price_data: { currency: "cad", unit_amount: 5472 } }],
      metadata: { order_id: "order-1", order_number: "ND-1001" },
      return_url: "https://shop.example/order-success?session_id={CHECKOUT_SESSION_ID}",
    });
    // Subscription-only and hosted-page-only settings are not sent for a one-time embedded payment.
    expect(params).not.toHaveProperty("payment_method_collection");
    expect(params).not.toHaveProperty("success_url");
    expect(params).not.toHaveProperty("cancel_url");
    expect(options).toEqual({ idempotencyKey: "checkout:order-1:initial" });
    expect(checkout).toEqual({
      id: "cs_test_abc",
      url: "https://shop.example/pay?session=cs_test_abc",
      clientSecret: "cs_test_abc_secret_x",
      expiresAt: 1900000000,
    });
  });

  it("refuses a session without a client secret", async () => {
    mocks.create.mockResolvedValue({ id: "cs_test_abc", client_secret: null, expires_at: 1 });
    await expect(
      createStripeCheckout({ orderId: "o", orderNumber: "ND-1", email: "a@b.test", amount: 100, currency: "CAD" }),
    ).rejects.toThrow("client secret");
  });

  it("points an open session at the on-site payment page", async () => {
    mocks.retrieve.mockResolvedValue({
      id: "cs_test_abc",
      status: "open",
      payment_status: "unpaid",
      client_secret: "cs_test_abc_secret_x",
      expires_at: 1900000000,
      amount_total: 5472,
      currency: "cad",
      payment_intent: null,
    });
    const session = await retrieveStripeCheckout("cs_test_abc");
    expect(session).toMatchObject({
      url: "https://shop.example/pay?session=cs_test_abc",
      clientSecret: "cs_test_abc_secret_x",
    });
    mocks.retrieve.mockResolvedValue({
      id: "cs_test_abc",
      status: "complete",
      payment_status: "paid",
      client_secret: "x",
    });
    expect((await retrieveStripeCheckout("cs_test_abc")).url).toBeNull();
  });
});

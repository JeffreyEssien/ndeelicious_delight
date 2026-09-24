import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  processEvent: vi.fn(),
  sendEmail: vi.fn(),
  orderSingle: vi.fn(),
}));

vi.mock("@/lib/payments/stripe", () => ({ constructStripeEvent: mocks.constructEvent }));
vi.mock("@/lib/data/payments", () => ({ processStripeCheckoutEvent: mocks.processEvent }));
vi.mock("@/lib/email/mailer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/mailer")>()),
  sendTransactionalEmail: mocks.sendEmail,
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: mocks.orderSingle }) }) }),
  }),
}));

import { POST } from "./route";

function request(signature = "valid") {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: "raw-body",
  });
}

function event(type = "checkout.session.completed", paymentStatus = "paid") {
  return {
    id: "evt_123",
    type,
    data: {
      object: {
        id: "cs_test_123",
        object: "checkout.session",
        amount_total: 1_000_000,
        currency: "ngn",
        payment_status: paymentStatus,
        payment_intent: "pi_123",
        metadata: { order_id: "order-id" },
      },
    },
  };
}

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.constructEvent.mockReturnValue(event());
    mocks.processEvent.mockResolvedValue({
      processed: true,
      becamePaid: true,
      orderId: "order-id",
      orderNumber: "ND-12345678",
    });
    mocks.orderSingle.mockResolvedValue({
      data: {
        customer_name: "Ada <Baker>",
        email: "ada@example.com",
        order_number: "ND-12345678",
        order_items: [{ product_name: "Cake <large>", variant_name: "Box", quantity: 1 }],
      },
      error: null,
    });
    mocks.sendEmail.mockResolvedValue({ sent: true });
  });

  it("rejects a webhook without a signature", async () => {
    const response = await POST(new Request("http://localhost/api/stripe/webhook", { method: "POST", body: "x" }));
    expect(response.status).toBe(400);
    expect(mocks.processEvent).not.toHaveBeenCalled();
  });

  it("rejects a payload whose Stripe signature cannot be verified", async () => {
    mocks.constructEvent.mockImplementationOnce(() => {
      throw new Error("bad signature");
    });
    const response = await POST(request("bad"));
    expect(response.status).toBe(400);
    expect(mocks.processEvent).not.toHaveBeenCalled();
  });

  it("processes a paid Checkout event and sends escaped notifications once", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.processEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventId: "evt_123",
        sessionId: "cs_test_123",
        paymentStatus: "paid",
        amountTotal: 1_000_000,
        currency: "ngn",
      }),
    );
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
    expect(mocks.sendEmail.mock.calls[0][0].html).toContain("Ada &lt;Baker&gt;");
    expect(mocks.sendEmail.mock.calls[0][0].html).toContain("Cake &lt;large&gt;");
  });

  it("does not send duplicate notifications when the database already processed the event", async () => {
    mocks.processEvent.mockResolvedValueOnce({ processed: false, becamePaid: false });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("records an asynchronous payment failure without sending confirmation", async () => {
    mocks.constructEvent.mockReturnValueOnce(event("checkout.session.async_payment_failed", "unpaid"));
    mocks.processEvent.mockResolvedValueOnce({ processed: true, becamePaid: false, orderId: "order-id" });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.processEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "checkout.session.async_payment_failed", paymentStatus: "unpaid" }),
    );
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("returns a retryable error when atomic database processing fails", async () => {
    mocks.processEvent.mockRejectedValueOnce(new Error("database unavailable"));
    const response = await POST(request());
    expect(response.status).toBe(500);
  });
});

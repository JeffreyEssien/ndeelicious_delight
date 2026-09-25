import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  processEvent: vi.fn(),
  deliverNotifications: vi.fn(),
  sendAdminNotification: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/server", () => ({ after: (callback: () => unknown) => callback() }));

vi.mock("@/lib/payments/stripe", () => ({ constructStripeEvent: mocks.constructEvent }));
vi.mock("@/lib/data/payments", () => ({ processStripeCheckoutEvent: mocks.processEvent }));
vi.mock("@/lib/orders/notifications", () => ({
  deliverPendingOrderNotifications: mocks.deliverNotifications,
  sendPaidOrderAdminNotification: mocks.sendAdminNotification,
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ service: true, rpc: mocks.rpc }),
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
        currency: "cad",
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
    mocks.deliverNotifications.mockResolvedValue(undefined);
    mocks.sendAdminNotification.mockResolvedValue(undefined);
    mocks.rpc.mockResolvedValue({ data: { processed: true, orderNumber: "ND-12345678" }, error: null });
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

  it("processes a paid Checkout event and drains its durable notification outbox", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.processEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventId: "evt_123",
        sessionId: "cs_test_123",
        paymentStatus: "paid",
        amountTotal: 1_000_000,
        currency: "cad",
      }),
    );
    expect(mocks.deliverNotifications).toHaveBeenCalledWith(expect.anything(), "ND-12345678");
    expect(mocks.sendAdminNotification).toHaveBeenCalledWith(expect.anything(), "ND-12345678");
  });

  it("does not send duplicate notifications when the database already processed the event", async () => {
    mocks.processEvent.mockResolvedValueOnce({ processed: false, becamePaid: false });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.deliverNotifications).not.toHaveBeenCalled();
    expect(mocks.sendAdminNotification).not.toHaveBeenCalled();
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
    expect(mocks.deliverNotifications).not.toHaveBeenCalled();
    expect(mocks.sendAdminNotification).not.toHaveBeenCalled();
  });

  it("returns a retryable error when atomic database processing fails", async () => {
    mocks.processEvent.mockRejectedValueOnce(new Error("database unavailable"));
    const response = await POST(request());
    expect(response.status).toBe(500);
  });

  it("atomically finalizes a succeeded asynchronous refund event", async () => {
    mocks.constructEvent.mockReturnValueOnce({
      id: "evt_refund_123",
      type: "refund.updated",
      data: { object: { id: "re_123", object: "refund", status: "succeeded", failure_reason: null } },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("process_stripe_refund_event", {
      p_event_id: "evt_refund_123",
      p_event_type: "refund.updated",
      p_provider_refund_id: "re_123",
      p_refund_status: "succeeded",
      p_failure_reason: null,
    });
    expect(mocks.deliverNotifications).toHaveBeenCalledWith(expect.anything(), "ND-12345678");
  });
});

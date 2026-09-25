import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  stripeRefund: vi.fn(),
  deliverNotifications: vi.fn(),
  readAuditState: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("next/server", () => ({ after: (callback: () => unknown) => callback() }));

vi.mock("@/lib/auth/admin-request", () => ({
  requireAdminRequest: () =>
    Promise.resolve({
      ok: true,
      db: { rpc: mocks.rpc },
      admin: { id: "22222222-2222-4222-8222-222222222222" },
      sessionId: "session-id",
    }),
}));
vi.mock("@/lib/payments/stripe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments/stripe")>()),
  createStripeRefund: mocks.stripeRefund,
}));
vi.mock("@/lib/orders/notifications", () => ({
  deliverPendingOrderNotifications: mocks.deliverNotifications,
}));
vi.mock("@/lib/audit/admin-audit-state", () => ({ readAdminAuditState: mocks.readAuditState }));
vi.mock("@/lib/audit/admin-audit", () => ({ recordAdminAudit: mocks.recordAudit }));

import { POST } from "./route";

const context = { params: Promise.resolve({ orderNumber: "ND-12345678" }) };
function request(body: unknown) {
  return new Request("http://localhost/api/admin/orders/ND-12345678/refund", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/orders/[orderNumber]/refund", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc
      .mockResolvedValueOnce({
        data: { refundId: "refund-row", status: "PENDING", amount: 2_500, paymentIntentId: "pi_123" },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { status: "REFUNDED", alreadyProcessed: false }, error: null });
    mocks.stripeRefund.mockResolvedValue({ id: "re_123", status: "succeeded" });
    mocks.deliverNotifications.mockResolvedValue(undefined);
    mocks.readAuditState.mockResolvedValue({ order_number: "ND-12345678", status: "PAID" });
    mocks.recordAudit.mockResolvedValue(undefined);
  });

  it("uses a server-verified refund record and Stripe idempotency key", async () => {
    const response = await POST(
      request({
        amount: 2_500,
        reason: "Customer requested cancellation",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      "begin_order_refund",
      expect.objectContaining({ p_order_number: "ND-12345678", p_amount: 2_500 }),
    );
    expect(mocks.stripeRefund).toHaveBeenCalledWith(
      expect.objectContaining({ paymentIntentId: "pi_123", amount: 2_500 }),
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "attach_order_refund_provider", {
      p_refund_id: "refund-row",
      p_provider_refund_id: "re_123",
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(3, "complete_order_refund", {
      p_refund_id: "refund-row",
      p_provider_refund_id: "re_123",
    });
    expect(mocks.deliverNotifications).toHaveBeenCalledWith(expect.anything(), "ND-12345678");
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sessionId: "session-id" }),
      expect.objectContaining({ action: "REFUND_INITIATED", entityId: "refund-row" }),
    );
  });

  it("rejects an invalid amount before creating a refund record", async () => {
    const response = await POST(
      request({
        amount: 0,
        reason: "Customer requested cancellation",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.stripeRefund).not.toHaveBeenCalled();
  });

  it("records a failed provider attempt without changing the order status", async () => {
    mocks.stripeRefund.mockRejectedValueOnce(new Error("provider unavailable"));
    const response = await POST(
      request({
        amount: 2_500,
        reason: "Customer requested cancellation",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
      }),
      context,
    );

    expect(response.status).toBe(502);
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "fail_order_refund", {
      p_refund_id: "refund-row",
      p_error_code: "stripe-refund-failed",
    });
  });
});

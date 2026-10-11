import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), after: vi.fn(), notify: vi.fn() }));
vi.mock("@/lib/auth/admin-request", () => ({ requireAdminRequest: mocks.auth }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/orders/notifications", () => ({ deliverPendingOrderNotifications: mocks.notify }));
import { POST } from "./route";
const request = (orders: unknown) =>
  new Request("http://localhost/api/admin/orders/bulk", { method: "POST", body: JSON.stringify({ orders }) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, db: { rpc: mocks.rpc }, admin: { id: "admin" }, sessionId: "session" });
});
describe("safe bulk fulfilment", () => {
  it("reports every successful, skipped and failed order independently", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: "READY", error: null })
      .mockResolvedValueOnce({ data: "CONFLICT", error: null })
      .mockResolvedValueOnce({ error: { message: "preparation pending" } });
    const response = await POST(
      request([
        { number: "A", expectedStatus: "PREPARING" },
        { number: "B", expectedStatus: "PREPARING" },
        { number: "C", expectedStatus: "CONFIRMED" },
      ]),
    );
    expect((await response.json()).results.map((r: { outcome: string }) => r.outcome)).toEqual([
      "successful",
      "skipped",
      "failed",
    ]);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({
      p_admin_id: "admin",
      p_session_id: "session",
      p_expected_status: "PREPARING",
    });
  });
  it("rejects payment/refund states and oversized batches", async () => {
    for (const orders of [
      [{ number: "A", expectedStatus: "REFUNDED" }],
      Array.from({ length: 101 }, () => ({ number: "A", expectedStatus: "READY" })),
    ])
      expect((await POST(request(orders))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("deduplicates repeated selections", async () => {
    mocks.rpc.mockResolvedValue({ data: "DELIVERED", error: null });
    const response = await POST(
      request([
        { number: "A", expectedStatus: "READY" },
        { number: "A", expectedStatus: "READY" },
      ]),
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect((await response.json()).results[1].outcome).toBe("skipped");
  });
});

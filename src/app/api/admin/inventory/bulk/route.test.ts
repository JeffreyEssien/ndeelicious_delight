import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/auth/admin-request", () => ({ requireAdminRequest: mocks.auth }));
vi.mock("@/lib/cache/storefront", () => ({ invalidateStorefrontCache: mocks.invalidate }));
import { POST } from "./route";
const row = {
  productId: "11111111-1111-4111-8111-111111111111",
  variantId: "22222222-2222-4222-8222-222222222222",
  expected: 12,
  mode: "set",
  quantity: 15,
};
const request = (rows: unknown[]) =>
  new Request("http://localhost/api/admin/inventory/bulk", { method: "POST", body: JSON.stringify({ rows }) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, db: { rpc: mocks.rpc }, admin: { id: "admin" }, sessionId: "session" });
});
describe("bulk inventory", () => {
  it("authorizes before any stock access", async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: Response.json({}, { status: 401 }) });
    expect((await POST(request([row]))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects duplicated variants before saving any row", async () => {
    expect((await POST(request([row, row]))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("reports saved and rejected rows separately without concealing a concurrency failure", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: 15, error: null })
      .mockResolvedValueOnce({ error: { message: "INVENTORY_CHANGED" } });
    const response = await POST(request([row, { ...row, variantId: "33333333-3333-4333-8333-333333333333" }]));
    const payload = await response.json();
    expect(payload.results[0]).toMatchObject({ saved: true, quantity: 15 });
    expect(payload.results[1]).toMatchObject({
      saved: false,
      error: "Stock changed. Export fresh quantities before retrying.",
    });
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_expected: 12, p_admin_id: "admin", p_session_id: "session" });
    expect(mocks.invalidate).toHaveBeenCalledOnce();
  });
});

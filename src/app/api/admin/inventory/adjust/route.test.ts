import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/auth/admin-request", () => ({ requireAdminRequest: mocks.auth }));
vi.mock("@/lib/cache/storefront", () => ({ invalidateStorefrontCache: mocks.invalidate }));
import { POST } from "./route";
const body = {
  productId: "11111111-1111-4111-8111-111111111111",
  variantId: "22222222-2222-4222-8222-222222222222",
  expected: 3,
  mode: "add",
  quantity: 12,
};
const post = (value: unknown) =>
  POST(new Request("http://localhost/api/admin/inventory/adjust", { method: "POST", body: JSON.stringify(value) }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, db: { rpc: mocks.rpc }, admin: { id: "admin" }, sessionId: "session" });
  mocks.rpc.mockResolvedValue({ data: 15, error: null });
});
describe("stock adjustment", () => {
  it("saves the reason with the adjustment", async () => {
    const response = await post({ ...body, reason: "Baked a batch" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ quantity: 15 });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "admin_adjust_inventory",
      expect.objectContaining({ p_mode: "add", p_quantity: 12, p_expected: 3, p_reason: "Baked a batch" }),
    );
    expect(mocks.invalidate).toHaveBeenCalled();
  });
  it("still works without a reason", async () => {
    await post(body);
    expect(mocks.rpc).toHaveBeenCalledWith("admin_adjust_inventory", expect.objectContaining({ p_reason: null }));
  });
  it("refuses an overly long reason before touching stock", async () => {
    expect((await post({ ...body, reason: "x".repeat(201) })).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("explains a stock change made by someone else meanwhile", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "INVENTORY_CHANGED" } });
    const response = await post(body);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("Stock changed while you were editing");
  });
});

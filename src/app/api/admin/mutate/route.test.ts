import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setProductInventory: vi.fn(),
  transitionOrderStatus: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/auth/admin-request", () => ({
  requireAdminRequest: () =>
    Promise.resolve({
      ok: true,
      db: { from: () => ({ upsert: mocks.upsert }) },
      admin: {},
      sessionId: "session-id",
    }),
}));
vi.mock("@/lib/data/inventory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/inventory")>()),
  setProductInventory: mocks.setProductInventory,
  transitionOrderStatus: mocks.transitionOrderStatus,
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/admin/mutate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/mutate inventory operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setProductInventory.mockResolvedValue(undefined);
    mocks.transitionOrderStatus.mockResolvedValue(undefined);
    mocks.upsert.mockResolvedValue({ error: null });
  });

  it("updates inventory through the reservation-aware database function", async () => {
    const response = await POST(
      request({ action: "inventory", id: "11111111-1111-4111-8111-111111111111", quantity: 8 }),
    );

    expect(response.status).toBe(200);
    expect(mocks.setProductInventory).toHaveBeenCalledWith(
      expect.anything(),
      "11111111-1111-4111-8111-111111111111",
      8,
    );
  });

  it("commits inventory through the atomic paid transition", async () => {
    const response = await POST(request({ action: "order-status", orderNumber: "ND-12345678", status: "PAID" }));

    expect(response.status).toBe(200);
    expect(mocks.transitionOrderStatus).toHaveBeenCalledWith(expect.anything(), "ND-12345678", "PAID");
  });

  it("reports a conflict when an adjustment would consume reserved units", async () => {
    const { InventoryConflictError } = await import("@/lib/data/inventory");
    mocks.setProductInventory.mockRejectedValueOnce(
      new InventoryConflictError(
        "STOCK_BELOW_RESERVED",
        "Stock cannot be reduced below the quantity held for pending orders.",
      ),
    );

    const response = await POST(
      request({ action: "inventory", id: "11111111-1111-4111-8111-111111111111", quantity: 0 }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "STOCK_BELOW_RESERVED" });
  });

  it("saves delivery minimums and ordering in one database write", async () => {
    const response = await POST(
      request({
        action: "delivery-zones",
        zones: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Lekki",
            fee: 250000,
            minimumOrder: 2000000,
            estimate: "Next day",
            active: true,
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith([expect.objectContaining({ minimum_order: 2000000, sort_order: 0 })]);
  });

  it("saves coupon eligibility and limits in one database write", async () => {
    const response = await POST(
      request({
        action: "coupons",
        coupons: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            code: "pastry10",
            type: "PERCENTAGE",
            value: 10,
            minimumOrder: 1000000,
            maximumDiscount: 500000,
            usageLimit: 20,
            perCustomerLimit: 1,
            active: true,
            startsAt: null,
            expiresAt: null,
            productIds: [],
            categoryIds: ["22222222-2222-4222-8222-222222222222"],
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith([
      expect.objectContaining({ code: "PASTRY10", per_customer_limit: 1, category_ids: expect.any(Array) }),
    ]);
  });
});

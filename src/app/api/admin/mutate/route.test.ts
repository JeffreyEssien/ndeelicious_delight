import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setProductInventory: vi.fn(),
  transitionAdminOrderStatus: vi.fn(),
  saveOrderInternalNote: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("next/server", () => ({ after: (callback: () => unknown) => callback() }));

vi.mock("@/lib/auth/admin-request", () => ({
  requireAdminRequest: () =>
    Promise.resolve({
      ok: true,
      db: { from: () => ({ upsert: mocks.upsert }) },
      admin: { id: "22222222-2222-4222-8222-222222222222" },
      sessionId: "session-id",
    }),
}));
vi.mock("@/lib/data/inventory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/inventory")>()),
  setProductInventory: mocks.setProductInventory,
  transitionAdminOrderStatus: mocks.transitionAdminOrderStatus,
  saveOrderInternalNote: mocks.saveOrderInternalNote,
}));
vi.mock("@/lib/orders/notifications", () => ({ deliverPendingOrderNotifications: vi.fn() }));

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
    mocks.transitionAdminOrderStatus.mockResolvedValue(undefined);
    mocks.saveOrderInternalNote.mockResolvedValue(undefined);
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

  it("records an allowed admin lifecycle transition", async () => {
    const response = await POST(request({ action: "order-status", orderNumber: "ND-12345678", status: "CONFIRMED" }));

    expect(response.status).toBe(200);
    expect(mocks.transitionAdminOrderStatus).toHaveBeenCalledWith(
      expect.anything(),
      "ND-12345678",
      "CONFIRMED",
      "22222222-2222-4222-8222-222222222222",
    );
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
            name: "Downtown Toronto",
            fee: 1_500,
            minimumOrder: 5_000,
            estimate: "Next day",
            active: true,
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith([expect.objectContaining({ minimum_order: 5_000, sort_order: 0 })]);
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

  it("rejects malformed storefront content before it reaches the database", async () => {
    const response = await POST(request({ action: "settings", key: "content", value: { home: {} } }));

    expect(response.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects arbitrary CSS in storefront appearance settings", async () => {
    const response = await POST(
      request({
        action: "settings",
        key: "appearance",
        value: {
          useCustomColors: true,
          colors: {
            background: "url(javascript:alert(1))",
            surface: "#ffffff",
            text: "#111111",
            mutedText: "#666666",
            primary: "#792f49",
            primaryDark: "#5d2137",
            accent: "#c89b49",
          },
          contentWidth: "standard",
          sectionSpacing: "comfortable",
          cornerStyle: "soft",
          productColumns: 4,
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setProductInventory: vi.fn(),
  transitionOrderStatus: vi.fn(),
}));

vi.mock("@/lib/auth/admin-request", () => ({
  requireAdminRequest: () => Promise.resolve({ ok: true, db: {}, admin: {}, sessionId: "session-id" }),
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
  });

  it("updates inventory through the reservation-aware database function", async () => {
    const response = await POST(
      request({ action: "inventory", id: "11111111-1111-4111-8111-111111111111", quantity: 8 }),
    );

    expect(response.status).toBe(200);
    expect(mocks.setProductInventory).toHaveBeenCalledWith(expect.anything(), "11111111-1111-4111-8111-111111111111", 8);
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
});

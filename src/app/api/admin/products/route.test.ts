import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ category: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/cache/storefront", () => ({ invalidateStorefrontCache: vi.fn() }));
vi.mock("@/lib/auth/admin-request", () => ({
  requireAdminRequest: async () => ({
    ok: true,
    db: {
      from: () => ({
        select: () => ({ eq: () => ({ single: mocks.category, maybeSingle: async () => ({ data: null }) }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
      rpc: mocks.rpc,
    },
    admin: { id: "admin-id" },
    sessionId: "session-id",
  }),
}));
import { POST } from "./route";
import { PATCH, POST as duplicate } from "./[id]/route";
const valid = {
  name: "Made to Order Cupcakes",
  slug: "made-to-order-cupcakes",
  shortDescription: "Prepared just for you.",
  description: "Fresh cupcakes in any size pack.",
  category: "PASTRIES",
  price: 1500,
  discountPrice: 1000,
  status: "ACTIVE",
  featured: false,
  shoppingMode: "MADE_TO_ORDER",
  trackInventory: true,
  lowStockThreshold: 3,
  ingredients: "",
  allergens: [],
  storageInstructions: "",
  preparationInstructions: "",
  variants: [
    { name: "Box of 8", packQuantity: 8, priceAdjustment: 1400, stockQuantity: 0, active: true, trackInventory: false },
  ],
  images: [],
};
const request = (data = valid) =>
  new Request("http://localhost/api/admin/products", { method: "POST", body: JSON.stringify(data) });
describe("atomic product endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.category.mockResolvedValue({ data: { id: "category-id" } });
    mocks.rpc.mockResolvedValue({ data: "product-id", error: null });
  });
  it("creates packs and prices with one atomic operation", async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, id: "product-id" });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      "admin_save_product",
      expect.objectContaining({
        p_id: null,
        p_admin_id: "admin-id",
        p_variants: [
          expect.objectContaining({ packQuantity: 8, priceAdjustment: 1400, trackInventory: false, sortOrder: 0 }),
        ],
      }),
    );
  });
  it("uses the same save path for edits and atomic duplication", async () => {
    expect((await PATCH(request(), { params: Promise.resolve({ id: "product-id" }) })).status).toBe(200);
    expect(mocks.rpc.mock.calls[0][1].p_id).toBe("product-id");
    expect((await duplicate(request(), { params: Promise.resolve({ id: "product-id" }) })).status).toBe(201);
    expect(mocks.rpc.mock.calls[1][0]).toBe("admin_duplicate_product");
  });
  it("rejects invalid publication before touching the database", async () => {
    expect((await POST(request({ ...valid, variants: [] }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("returns a conflict when inventory changes, without a partial-save fallback", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "INVENTORY_CHANGED" } });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/Reload/);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});

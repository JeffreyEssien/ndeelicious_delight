import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/cache/storefront", () => ({ invalidateStorefrontCache: vi.fn() }));
vi.mock("@/lib/auth/admin-request", () => ({
  requireAdminRequest: async () => ({
    ok: true,
    db: {
      from: () => ({
        select: () => {
          const query = {
            eq: () => query,
            neq: () => query,
            limit: async () => ({ data: [], error: null }),
            single: async () => ({ data: { id: "category-id" } }),
          };
          return query;
        },
      }),
      rpc: mocks.rpc,
    },
    admin: { id: "admin-id" },
    sessionId: "session-id",
  }),
}));
import { PATCH, POST } from "./route";
beforeEach(() => {
  vi.clearAllMocks();
});
it("reports ownership violations from the atomic writer", async () => {
  mocks.rpc.mockResolvedValue({ error: { message: "VARIANT_OWNERSHIP" } });
  const response = await PATCH(
    new Request("http://localhost/api/admin/products/product-id", {
      method: "PATCH",
      body: JSON.stringify({
        name: "Almond Croissant",
        slug: "almond-croissant",
        shortDescription: "Crisp pastry",
        description: "Fresh almond pastry",
        category: "PASTRIES",
        price: 500,
        discountPrice: null,
        status: "DRAFT",
        featured: false,
        trackInventory: true,
        lowStockThreshold: 3,
        allergens: [],
        variants: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Single",
            priceAdjustment: 0,
            stockQuantity: 12,
            active: true,
          },
        ],
        images: [],
      }),
    }),
    { params: Promise.resolve({ id: "product-id" }) },
  );
  expect(response.status).toBe(400);
  expect((await response.json()).error).toMatch(/does not belong/);
});
it("does not return a successful duplicate if any part of the transaction fails", async () => {
  mocks.rpc.mockResolvedValue({ error: { message: "image copy failed" } });
  expect(
    (
      await POST(new Request("http://localhost/api/admin/products/product-id", { method: "POST" }), {
        params: Promise.resolve({ id: "product-id" }),
      })
    ).status,
  ).toBe(500);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  categorySingle: vi.fn(),
  productSingle: vi.fn(),
  productInsert: vi.fn(),
  variantInsert: vi.fn(),
  productDelete: vi.fn(),
  readAuditState: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("@/lib/audit/admin-audit-state", () => ({ readAdminAuditState: mocks.readAuditState }));
vi.mock("@/lib/audit/admin-audit", () => ({ recordAdminAudit: mocks.recordAudit }));

const db = {
  from(table: string) {
    if (table === "categories") {
      return { select: () => ({ eq: () => ({ single: mocks.categorySingle }) }) };
    }
    if (table === "products") {
      return {
        insert: (value: unknown) => {
          mocks.productInsert(value);
          return { select: () => ({ single: mocks.productSingle }) };
        },
        delete: () => ({ eq: mocks.productDelete }),
      };
    }
    if (table === "product_variants") return { insert: mocks.variantInsert };
    throw new Error(`Unexpected table: ${table}`);
  },
};

vi.mock("@/lib/auth/admin-request", () => ({
  requireAdminRequest: () => Promise.resolve({ ok: true, db, admin: { id: "admin-id" }, sessionId: "session-id" }),
}));

import { POST } from "./route";

const validProduct = {
  name: "Almond Croissant",
  slug: "almond-croissant",
  shortDescription: "A crisp almond pastry.",
  description: "Laminated pastry filled with almond cream.",
  category: "PASTRIES",
  price: 450_000,
  discountPrice: null,
  status: "DRAFT",
  featured: false,
  trackInventory: true,
  lowStockThreshold: 3,
  ingredients: "Flour, butter, almonds",
  allergens: ["Wheat", "Milk", "Nuts"],
  storageInstructions: "Keep cool.",
  preparationInstructions: "Serve at room temperature.",
  variants: [{ name: "Single", priceAdjustment: 0, stockQuantity: 12, active: true }],
  images: [],
};

describe("POST /api/admin/products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.categorySingle.mockResolvedValue({ data: { id: "category-id" }, error: null });
    mocks.productSingle.mockResolvedValue({ data: { id: "product-id" }, error: null });
    mocks.variantInsert.mockResolvedValue({ error: null });
    mocks.readAuditState.mockResolvedValue({ id: "product-id", name: "Almond Croissant" });
    mocks.recordAudit.mockResolvedValue(undefined);
  });

  it("creates a complete product and its variants", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/products", { method: "POST", body: JSON.stringify(validProduct) }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true, id: "product-id" });
    expect(mocks.productInsert).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Almond Croissant", category_id: "category-id", base_price: 450_000 }),
    );
    expect(mocks.variantInsert).toHaveBeenCalledWith([expect.not.objectContaining({ sku: expect.anything() })]);
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ sessionId: "session-id" }),
      expect.objectContaining({ action: "PRODUCT_CREATED", entityId: "product-id", previousValue: null }),
    );
  });

  it("rejects an active product without an active variant", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/products", {
        method: "POST",
        body: JSON.stringify({
          ...validProduct,
          status: "ACTIVE",
          variants: [{ ...validProduct.variants[0], active: false }],
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.productInsert).not.toHaveBeenCalled();
  });
});

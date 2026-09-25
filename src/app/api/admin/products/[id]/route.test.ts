import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sourceSingle: vi.fn(),
  copySingle: vi.fn(),
  productInsert: vi.fn(),
  relationInsert: vi.fn(),
  categorySingle: vi.fn(),
  productUpdate: vi.fn(),
  readAuditState: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("@/lib/audit/admin-audit-state", () => ({ readAdminAuditState: mocks.readAuditState }));
vi.mock("@/lib/audit/admin-audit", () => ({ recordAdminAudit: mocks.recordAudit }));

const source = {
  category_id: "category-id",
  name: "Almond Croissant",
  slug: "almond-croissant",
  short_description: "Crisp pastry",
  description: "Crisp almond pastry",
  base_price: 450_000,
  discount_price: null,
  track_inventory: true,
  stock_quantity: 12,
  low_stock_threshold: 3,
  ingredients: "Flour",
  allergens: ["Wheat"],
  storage_instructions: null,
  preparation_instructions: null,
  product_variants: [{ name: "Single", price_adjustment: 0, stock_quantity: 12, active: true }],
  product_images: [{ url: "/pastries.jpg", alt_text: "Croissant", sort_order: 0, storage_path: null }],
};

const db = {
  from(table: string) {
    if (table === "products") {
      return {
        select: () => ({ eq: () => ({ single: mocks.sourceSingle }) }),
        insert: (value: unknown) => {
          mocks.productInsert(value);
          return { select: () => ({ single: mocks.copySingle }) };
        },
        update: (value: unknown) => {
          mocks.productUpdate(value);
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
    }
    if (table === "categories") return { select: () => ({ eq: () => ({ single: mocks.categorySingle }) }) };
    if (table === "product_variants" || table === "product_images") {
      return {
        insert: (value: unknown) => {
          mocks.relationInsert(table, value);
          return Promise.resolve({ error: null });
        },
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: table === "product_variants" ? [{ id: "11111111-1111-4111-8111-111111111111" }] : [],
            }),
        }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  },
};

vi.mock("@/lib/auth/admin-request", () => ({
  requireAdminRequest: () => Promise.resolve({ ok: true, db, admin: { id: "admin-id" }, sessionId: "session-id" }),
}));

import { PATCH, POST } from "./route";

describe("/api/admin/products/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sourceSingle.mockResolvedValue({ data: source, error: null });
    mocks.copySingle.mockResolvedValue({ data: { id: "copy-id" }, error: null });
    mocks.categorySingle.mockResolvedValue({ data: { id: "category-id" }, error: null });
    mocks.readAuditState.mockResolvedValue(source);
    mocks.recordAudit.mockResolvedValue(undefined);
  });

  it("duplicates products as unfeatured drafts without conflicting SKUs", async () => {
    const response = await POST(new Request("http://localhost/api/admin/products/source-id", { method: "POST" }), {
      params: Promise.resolve({ id: "source-id" }),
    });

    expect(response.status).toBe(201);
    expect(mocks.productInsert).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Almond Croissant (Copy)", status: "DRAFT", featured: false, sku: null }),
    );
    expect(mocks.relationInsert).toHaveBeenCalledWith("product_variants", [
      expect.not.objectContaining({ sku: expect.anything() }),
    ]);
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ sessionId: "session-id" }),
      expect.objectContaining({ action: "PRODUCT_DUPLICATED", entityId: "copy-id" }),
    );
  });

  it("rejects a variant ID owned by another product", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/admin/products/source-id", {
        method: "PATCH",
        body: JSON.stringify({
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
          ingredients: "Flour",
          allergens: ["Wheat"],
          storageInstructions: "",
          preparationInstructions: "",
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
      { params: Promise.resolve({ id: "source-id" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.productUpdate).not.toHaveBeenCalled();
  });
});

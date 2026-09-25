import { describe, expect, it } from "vitest";
import { categorySlug, productInputSchema } from "./product";

const valid = {
  name: "Almond Croissant",
  slug: "almond-croissant",
  shortDescription: "A crisp almond pastry.",
  description: "Laminated pastry filled with almond cream.",
  category: "PASTRIES" as const,
  price: 450_000,
  discountPrice: null,
  status: "DRAFT" as const,
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

describe("productInputSchema", () => {
  it("accepts a complete product editor payload", () => {
    expect(productInputSchema.safeParse(valid).success).toBe(true);
    expect(categorySlug(valid.category)).toBe("pastries");
  });

  it("rejects unsafe slugs and products without variants", () => {
    expect(productInputSchema.safeParse({ ...valid, slug: "../Secret", variants: [] }).success).toBe(false);
  });

  it("rejects fractional monetary values", () => {
    expect(productInputSchema.safeParse({ ...valid, price: 10.5 }).success).toBe(false);
  });

  it("requires an active option before publishing", () => {
    expect(
      productInputSchema.safeParse({ ...valid, status: "ACTIVE", variants: [{ ...valid.variants[0], active: false }] })
        .success,
    ).toBe(false);
  });

  it("does not accept client-owned product or inventory-unit SKUs", () => {
    const result = productInputSchema.parse({
      ...valid,
      sku: "MANUAL-PRODUCT-SKU",
      variants: [{ ...valid.variants[0], sku: "MANUAL-VARIANT-SKU" }],
    });
    expect(result).not.toHaveProperty("sku");
    expect(result.variants[0]).not.toHaveProperty("sku");
  });
});

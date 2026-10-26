import { describe, expect, it } from "vitest";
import { categorySlug, productInputSchema, productVariantInputSchema } from "./product";

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

  it("lets a hidden draft be saved half-finished", () => {
    expect(
      productInputSchema.safeParse({ ...valid, shortDescription: "", description: "", variants: [] }).success,
    ).toBe(true);
  });

  it("requires descriptions for visible non-cakes but allows cakes to omit them", () => {
    const blank = { ...valid, status: "ACTIVE" as const, shortDescription: "", description: "" };
    expect(productInputSchema.safeParse(blank).success).toBe(false);
    expect(productInputSchema.safeParse({ ...blank, category: "CUSTOM_CAKES" }).success).toBe(true);
  });

  it("rejects unsafe slugs and products without variants", () => {
    expect(productInputSchema.safeParse({ ...valid, slug: "../Secret" }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...valid, status: "ACTIVE", variants: [] }).success).toBe(false);
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

it("stores explicit pack quantities and rejects zero, fractional or negative pieces", () => {
  for (const packQuantity of [0, -1, 1.5])
    expect(
      productVariantInputSchema.safeParse({
        name: "Owner label",
        packQuantity,
        priceAdjustment: 0,
        stockQuantity: 0,
        active: true,
      }).success,
    ).toBe(false);
  for (const packQuantity of [3, 6, 12])
    expect(
      productVariantInputSchema.parse({
        name: "Owner label",
        packQuantity,
        priceAdjustment: 0,
        stockQuantity: 0,
        active: true,
      }).packQuantity,
    ).toBe(packQuantity);
});

it("persists whole-minute lead times of at least 24 hours without rounding", () => {
  for (const minutes of [1440, 1441, 1455, 1530, 525600]) {
    expect(productInputSchema.parse({ ...valid, preparationHours: minutes / 60 }).preparationHours).toBe(minutes / 60);
  }
  for (const preparationHours of [-1, 0, 23.5, 9000, 24.001, Number.NaN])
    expect(productInputSchema.safeParse({ ...valid, preparationHours }).success).toBe(false);
});

it("validates arbitrary priced packs, empty drafts, unique active sizes and stable IDs", () => {
  const madeToOrder = {
    ...valid,
    shoppingMode: "MADE_TO_ORDER",
    status: "ACTIVE",
    price: 1000,
    discountPrice: 800,
    variants: [3, 5, 8, 15].map((packQuantity, index) => ({
      name: `Box of ${packQuantity}`,
      packQuantity,
      priceAdjustment: 400 + index * 900,
      stockQuantity: 0,
      trackInventory: false,
      active: true,
    })),
  };
  expect(productInputSchema.safeParse(madeToOrder).success).toBe(true);
  expect(productInputSchema.safeParse({ ...madeToOrder, status: "DRAFT", variants: [] }).success).toBe(true);
  for (const variants of [
    [],
    [{ ...madeToOrder.variants[0], packQuantity: null }],
    [{ ...madeToOrder.variants[0], priceAdjustment: -800 }],
    [...madeToOrder.variants, madeToOrder.variants[0]],
  ]) {
    expect(productInputSchema.safeParse({ ...madeToOrder, variants }).success).toBe(false);
  }
  expect(
    productInputSchema.safeParse({
      ...madeToOrder,
      variants: [...madeToOrder.variants, { ...madeToOrder.variants[0], active: false }],
    }).success,
  ).toBe(true);
});

import { describe, expect, it } from "vitest";
import type { Product } from "@/types";
import { getDefaultPurchasableVariant, getPurchasableVariants, isProductPurchasable } from "./availability";

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "product",
    slug: "product",
    name: "Product",
    shortDescription: "",
    description: "",
    category: "PASTRIES",
    price: 1000,
    image: "",
    status: "ACTIVE",
    trackInventory: true,
    stockQuantity: 2,
    lowStockThreshold: 1,
    variants: [
      { id: "one", name: "One", priceAdjustment: 0, stockQuantity: 2, active: true },
      { id: "sold", name: "Sold", priceAdjustment: 0, stockQuantity: 0, active: true },
    ],
    ingredients: "",
    allergens: [],
    ...overrides,
  };
}

describe("catalog availability", () => {
  it("returns only active in-stock variants", () => {
    expect(getPurchasableVariants(product()).map((variant) => variant.id)).toEqual(["one"]);
  });

  it("does not expose variants from an unavailable product", () => {
    expect(isProductPurchasable(product({ status: "OUT_OF_STOCK" }))).toBe(false);
  });

  it("chooses the first purchasable option as the default", () => {
    expect(getDefaultPurchasableVariant(product())?.id).toBe("one");
    expect(
      getDefaultPurchasableVariant(
        product({
          variants: [
            { id: "one", name: "One", priceAdjustment: 0, stockQuantity: 2 },
            { id: "two", name: "Two", priceAdjustment: 0, stockQuantity: 2 },
          ],
        }),
      ),
    ).toMatchObject({ id: "one" });
  });
});

it("orders arbitrary made-to-order packs and applies each pack’s inventory policy", async () => {
  const { getPublishedVariants, variantQuantityLimit } = await import("./availability");
  const packs = product({
    shoppingMode: "MADE_TO_ORDER",
    trackInventory: true,
    variants: [
      { id: "legacy", name: "Legacy", priceAdjustment: 0, stockQuantity: 10, active: true },
      {
        id: "eight",
        name: "Box of 8",
        packQuantity: 8,
        priceAdjustment: 1400,
        stockQuantity: 2,
        trackInventory: true,
        sortOrder: 2,
      },
      {
        id: "five",
        name: "Box of 5",
        packQuantity: 5,
        priceAdjustment: 900,
        stockQuantity: 0,
        trackInventory: false,
        sortOrder: 1,
      },
      {
        id: "sold",
        name: "Pack of 15",
        packQuantity: 15,
        priceAdjustment: 3000,
        stockQuantity: 0,
        trackInventory: true,
        sortOrder: 3,
      },
      { id: "disabled", name: "Pack of 3", packQuantity: 3, priceAdjustment: 200, stockQuantity: 8, active: false },
      {
        id: "retired",
        name: "Pack of 7",
        packQuantity: 7,
        priceAdjustment: 200,
        stockQuantity: 8,
        retiredAt: "2026-10-11",
      },
    ],
  });
  expect(getPublishedVariants(packs).map((v) => v.id)).toEqual(["five", "eight", "sold"]);
  expect(getPurchasableVariants(packs).map((v) => v.id)).toEqual(["five", "eight"]);
  expect(variantQuantityLimit(packs, packs.variants[1])).toBe(2);
  expect(variantQuantityLimit(packs, packs.variants[2])).toBe(50);
  expect(variantQuantityLimit(packs, packs.variants[3])).toBe(0);
});

it("keeps real pack prices on sold-out cards", async () => {
  const { productStartingPrice } = await import("./pricing");
  const soldOut = product({
    shoppingMode: "MADE_TO_ORDER",
    price: 9999,
    variants: [{ id: "eight", name: "Box of 8", packQuantity: 8, priceAdjustment: -7599, stockQuantity: 0 }],
  });
  expect(isProductPurchasable(soldOut)).toBe(false);
  expect(productStartingPrice(soldOut)).toBe(2400);
});

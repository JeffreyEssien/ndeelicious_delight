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

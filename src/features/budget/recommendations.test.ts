import { describe, expect, it } from "vitest";
import type { Product } from "@/types";
import type { CakeOption } from "@/types/content";
import { cakeRecommendations, deriveBudgetBands, productsInBudget } from "./recommendations";

const product = (id: string, price: number, status: Product["status"] = "ACTIVE"): Product => ({
  id,
  slug: id,
  name: id,
  shortDescription: "",
  description: "",
  category: "PASTRIES",
  price,
  image: "",
  status,
  trackInventory: false,
  stockQuantity: 0,
  lowStockThreshold: 0,
  variants: [{ id: `${id}-variant`, name: "Standard", priceAdjustment: 0, stockQuantity: 0 }],
  ingredients: "",
  allergens: [],
});

const option = (
  type: CakeOption["type"],
  name: string,
  priceAdjustment: number,
  quoteRequired = false,
): CakeOption => ({
  id: `${type}-${name}`,
  type,
  name,
  description: "",
  priceAdjustment,
  quoteRequired,
  active: true,
  sortOrder: 0,
});

describe("budget recommendations", () => {
  it("derives bands only from available database products", () => {
    const bands = deriveBudgetBands([
      product("one", 1000),
      product("two", 2000),
      product("three", 3000),
      product("hidden", 9000, "DRAFT"),
    ]);
    expect(bands.flatMap((band) => [band.minimum, band.maximum])).not.toContain(9000);
    expect(bands.reduce((sum, band) => sum + band.productCount, 0)).toBe(3);
  });

  it("matches live products inside the chosen range", () => {
    expect(
      productsInBudget([product("small", 1000), product("fit", 2500), product("large", 5000)], 2000, 3000),
    ).toHaveLength(1);
  });

  it("builds a complete fixed-price cake without exceeding the budget", () => {
    const options = [
      option("occasion", "Birthday", 0),
      option("size", "Small", 2500),
      option("size", "Large", 5000),
      option("flavour", "Vanilla", 500),
      option("filling", "Cream", 500),
      option("design", "Classic", 1000),
      option("design", "Sculpted", 1000, true),
    ];
    const result = cakeRecommendations(options, 0, 5000);
    expect(result[0].total).toBeLessThanOrEqual(5000);
    expect(Object.keys(result[0].selections)).toHaveLength(5);
    expect(result.some((item) => item.selections.design.name === "Sculpted")).toBe(false);
  });
});

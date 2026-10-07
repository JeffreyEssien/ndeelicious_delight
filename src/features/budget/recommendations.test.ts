import { describe, expect, it } from "vitest";
import type { Product } from "@/types";
import type { CakeOption } from "@/types/content";
import {
  cakeRecommendationHref,
  cakeBudgetState,
  cakeRecommendations,
  cakeRecommendationBands,
  closestProductsAboveBudget,
  deriveBudgetPresets,
  productsInBudget,
  purchasableBudgetOptions,
} from "./recommendations";

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

const cakeType = {
  id: "cake",
  name: "Birthday",
  slug: "birthday",
  description: "",
  basePrice: 0,
  active: true,
  leadTimeValue: 1,
  leadTimeUnit: "weeks" as const,
  sortOrder: 0,
  image: "",
  customerNotice: "",
};
const cakeInput = (options: CakeOption[]) => ({
  cakeTypes: [cakeType],
  options,
  relationships: options.map((option) => ({ cakeTypeId: cakeType.id, optionId: option.id })),
});

describe("budget recommendations", () => {
  it("derives friendly maximums only from available database products", () => {
    const presets = deriveBudgetPresets([
      product("one", 1000),
      product("two", 2000),
      product("three", 3000),
      product("hidden", 9000, "DRAFT"),
    ]);
    expect(presets.map((preset) => preset.maximum)).toEqual([1000, 2000, 3000]);
    expect(presets.at(-1)?.productCount).toBe(3);
  });

  it("treats custom budget as a true maximum and preserves catalogue order", () => {
    expect(
      productsInBudget([product("small", 1000), product("fit", 2500), product("large", 5000)], 3000).map(
        (item) => item.id,
      ),
    ).toEqual(["small", "fit"]);
  });

  it("returns honest closest options above an empty budget", () => {
    const result = closestProductsAboveBudget([product("higher", 3000), product("closest", 2000)], 1000);
    expect(result[0].id).toBe("closest");
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
    const result = cakeRecommendations({ ...cakeInput(options), maximum: 5000 });
    expect(result[0].total).toBeLessThanOrEqual(5000);
    expect(Object.keys(result[0].selections)).toHaveLength(5);
    expect(result.find((item) => item.selections.design?.name === "Sculpted")?.pricingMode).toBe("STARTING_FROM");
    expect(cakeRecommendationHref(result[0])).toContain("sizeId=size-Small");
  });

  it("spreads cake ideas across three calculated levels of the customer maximum", () => {
    const options = [
      option("occasion", "Birthday", 0),
      option("size", "Small", 5000),
      option("size", "Medium", 15000),
      option("size", "Large", 25000),
      option("flavour", "Vanilla", 1000),
      option("filling", "Cream", 1000),
      option("design", "Classic", 1000),
    ];
    const bands = cakeRecommendationBands(cakeInput(options), 30000);
    expect(bands.map((band) => band.maximum)).toEqual([10000, 20000, 30000]);
    expect(bands.every((band) => band.recommendations.every((cake) => cake.total <= band.maximum))).toBe(true);
  });
});

describe("pack budget matching", () => {
  it("matches only affordable, active, purchasable packs", () => {
    const packs = {
      ...product("croissants", 1500),
      variants: [
        { id: "3", name: "Pack of 3", priceAdjustment: 0, stockQuantity: 0, active: true },
        { id: "6", name: "Pack of 6", priceAdjustment: 1200, stockQuantity: 0, active: true },
        { id: "12", name: "Pack of 12", priceAdjustment: 3500, stockQuantity: 0, active: true },
        { id: "disabled", name: "Hidden", priceAdjustment: -500, stockQuantity: 0, active: false },
      ],
    };
    const matches = productsInBudget([packs], 3000);
    expect(purchasableBudgetOptions(matches).map((option) => [option.variant.name, option.price])).toEqual([
      ["Pack of 3", 1500],
      ["Pack of 6", 2700],
    ]);
    expect(purchasableBudgetOptions([{ ...packs, trackInventory: true }])).toEqual([]);
  });
});

it("keeps recommendations type-specific and distinguishes incomplete setup from budget", () => {
  const options = [
    option("occasion", "Birthday", 0),
    option("size", "Small", 1000),
    option("flavour", "Vanilla", 0),
    option("filling", "Cream", 0),
    option("design", "Custom", 0, true),
  ];
  const otherType = { ...cakeType, id: "other", basePrice: 9000, leadTimeValue: 3 };
  const input = { ...cakeInput(options), cakeTypes: [{ ...cakeType, basePrice: 2000 }, otherType], maximum: 4000 };
  const recommendations = cakeRecommendations(input);
  expect(recommendations).toHaveLength(1);
  expect(recommendations[0].cakeType.id).toBe(cakeType.id);
  expect(recommendations[0].total).toBe(3000);
  expect(recommendations[0].pricingMode).toBe("STARTING_FROM");
  expect(cakeBudgetState({ ...input, relationships: [] })).toBe("INCOMPLETE");
  expect(cakeBudgetState({ ...input, cakeTypes: [{ ...cakeType, basePrice: null }] })).toBe("SETUP_REQUIRED");
  expect(cakeBudgetState({ ...input, cakeTypes: [] })).toBe("UNAVAILABLE");
  expect(cakeBudgetState({ ...input, maximum: 100 })).toBe("BELOW_BUDGET");
});

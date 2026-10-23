import { describe, expect, it } from "vitest";
import type { Product } from "@/types";
import {
  cakeLayerAdjustment,
  lineUnitPrice,
  normalizeCakeLayers,
  normalizeCakeSizeLayers,
  variantPrice,
} from "./pricing";

const cake: Product = {
  id: "cake",
  slug: "cake",
  name: "Layer cake",
  shortDescription: "",
  description: "",
  category: "CUSTOM_CAKES",
  price: 5000,
  image: "",
  status: "ACTIVE",
  stockQuantity: 0,
  lowStockThreshold: 0,
  variants: [{ id: "eight", name: '8"', priceAdjustment: 0, stockQuantity: 0 }],
  ingredients: "",
  allergens: [],
  cakeLayers: {
    eight: [
      { layers: 2, priceAdjustment: 0 },
      { layers: 3, priceAdjustment: 1500 },
    ],
  },
};
const size = cake.variants[0];

describe("normalizeCakeSizeLayers", () => {
  it("accepts the legacy single-number shape", () => {
    expect(normalizeCakeSizeLayers(3)).toEqual([{ layers: 3, priceAdjustment: 0 }]);
  });
  it("keeps the current object-list shape and clamps/sorts/dedupes", () => {
    expect(
      normalizeCakeSizeLayers([
        { layers: 3, priceAdjustment: 1500 },
        { layers: 9, priceAdjustment: 100 },
        { layers: 3, priceAdjustment: 999 },
      ]),
    ).toEqual([
      { layers: 3, priceAdjustment: 1500 },
      { layers: 6, priceAdjustment: 100 },
    ]);
  });
  it("returns an empty list for nullish input", () => {
    expect(normalizeCakeSizeLayers(undefined)).toEqual([]);
    expect(normalizeCakeSizeLayers(null)).toEqual([]);
  });
});

describe("normalizeCakeLayers", () => {
  it("normalizes every size and drops empty ones", () => {
    expect(normalizeCakeLayers({ eight: 2, six: [], ten: [{ layers: 1, priceAdjustment: 0 }] })).toEqual({
      eight: [{ layers: 2, priceAdjustment: 0 }],
      ten: [{ layers: 1, priceAdjustment: 0 }],
    });
  });
});

describe("cakeLayerAdjustment / lineUnitPrice", () => {
  it("adds the chosen layer's adjustment", () => {
    const selections = [{ group: "Layers", value: "3" }];
    expect(cakeLayerAdjustment(cake, "eight", selections)).toBe(1500);
    expect(lineUnitPrice(cake, size, selections)).toBe(variantPrice(cake, size) + 1500);
  });
  it("is zero with no layer selection or an unknown layer", () => {
    expect(cakeLayerAdjustment(cake, "eight", undefined)).toBe(0);
    expect(cakeLayerAdjustment(cake, "eight", [{ group: "Layers", value: "5" }])).toBe(0);
    expect(lineUnitPrice(cake, size, [{ group: "Flavour", value: "Vanilla" }])).toBe(variantPrice(cake, size));
  });
  it("ignores layer selections on non-cakes", () => {
    const pastry: Product = { ...cake, category: "PASTRIES" };
    expect(cakeLayerAdjustment(pastry, "eight", [{ group: "Layers", value: "3" }])).toBe(0);
  });
});

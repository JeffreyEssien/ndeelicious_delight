import { describe, expect, it } from "vitest";
import { parseShopCategory, parseShoppingMode } from "./shop-filters";

describe("shop link filters", () => {
  it("accepts category enum values and slug-style values", () => {
    expect(parseShopCategory("PASTRIES")).toBe("PASTRIES");
    expect(parseShopCategory("ready-to-bake")).toBe("READY_TO_BAKE");
    expect(parseShopCategory(" Custom-Cakes ")).toBe("CUSTOM_CAKES");
  });

  it("ignores unknown or missing categories instead of filtering everything out", () => {
    expect(parseShopCategory("croissants")).toBeUndefined();
    expect(parseShopCategory("")).toBeUndefined();
    expect(parseShopCategory(undefined)).toBeUndefined();
  });

  it("accepts the shopping modes used by the homepage cards", () => {
    expect(parseShoppingMode("READY_TO_ORDER")).toBe("READY_TO_ORDER");
    expect(parseShoppingMode("made-to-order")).toBe("MADE_TO_ORDER");
    expect(parseShoppingMode("READY_TO_BAKE")).toBe("READY_TO_BAKE");
    expect(parseShoppingMode("frozen")).toBeUndefined();
    expect(parseShoppingMode(undefined)).toBeUndefined();
  });
});

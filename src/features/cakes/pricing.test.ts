import { describe, expect, it } from "vitest";
import { calculateCakeConfigurationPrice } from "./pricing";
import type { CakeConfiguration } from "@/types";
const cakeType = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Birthday Cake",
  slug: "birthday-cake",
  description: "",
  basePrice: 2500,
  leadTimeValue: 3,
  leadTimeUnit: "days" as const,
  active: true,
  sortOrder: 0,
  image: "",
  customerNotice: "",
};
const cake: CakeConfiguration = {
  cakeTypeId: cakeType.id,
  occasion: "Birthday",
  size: "8 inch",
  flavour: "Dark chocolate",
  filling: "Berry preserve",
  design: "Vintage piping",
  colours: "Ivory",
  inscription: "Happy birthday",
  referenceName: "",
  deliveryDate: "2026-09-20",
};
const option = (
  type: "occasion" | "size" | "flavour" | "filling" | "design",
  name: string,
  priceAdjustment = 0,
  quoteRequired = false,
) => ({
  id: `${type}-${name}`,
  type,
  name,
  description: "",
  priceAdjustment,
  quoteRequired,
  active: true,
  sortOrder: 0,
});
const options = [
  option("occasion", "Birthday"),
  option("size", "8 inch", 4200000),
  option("flavour", "Dark chocolate", 300000),
  option("filling", "Berry preserve", 250000),
  option("design", "Vintage piping", 800000),
  option("design", "Floral garden", 1200000, true),
];
describe("cake pricing", () => {
  it("calculates all database adjustments", () => {
    expect(calculateCakeConfigurationPrice(cake, options, cakeType).total).toBe(5552500);
  });
  it("routes database-marked designs to quote review", () => {
    expect(calculateCakeConfigurationPrice({ ...cake, design: "Floral garden" }, options, cakeType).quoteRequired).toBe(
      true,
    );
  });
});

it("rejects unavailable or mismatched option IDs and missing base prices", () => {
  expect(() => calculateCakeConfigurationPrice({ ...cake, optionIds: { size: "wrong" } }, options, cakeType)).toThrow(
    "unavailable",
  );
  expect(() => calculateCakeConfigurationPrice(cake, options, { ...cakeType, basePrice: null })).toThrow("base price");
});

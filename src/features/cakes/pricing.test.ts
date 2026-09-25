import { describe, expect, it } from "vitest";
import { calculateCakeQuote } from "./pricing";
import type { CakeConfiguration } from "@/types";
const cake: CakeConfiguration = {
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
    expect(calculateCakeQuote(cake, options, { now: new Date("2026-09-15T10:00:00Z") }).estimatedTotal).toBe(5550000);
  });
  it("routes database-marked designs to quote review", () => {
    expect(
      calculateCakeQuote({ ...cake, design: "Floral garden" }, options, { now: new Date("2026-09-15T10:00:00Z") })
        .quoteRequired,
    ).toBe(true);
  });
  it("enforces the configured preparation lead time", () => {
    expect(() =>
      calculateCakeQuote({ ...cake, deliveryDate: "2026-09-16" }, options, {
        now: new Date("2026-09-15T10:00:00Z"),
        leadTimeHours: 72,
      }),
    ).toThrow(/preparation/);
  });
});

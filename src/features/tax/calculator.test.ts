import { describe, expect, it } from "vitest";
import { calculateLineTaxes } from "./calculator";
import { allocateDiscount } from "./allocation";
import { itemTaxRate } from "./rules";
import type { TaxLineInput } from "./types";
const line = (
  id: string,
  grossAmount: number,
  taxClass: TaxLineInput["taxClass"],
  packQuantity: number | null = null,
  discountEligible = true,
): TaxLineInput => ({ id, grossAmount, taxClass, packQuantity, discountEligible });
describe("line-level Nova Scotia HST", () => {
  it("uses real pack quantity, not labels or basket quantity", () => {
    expect([3, 6, 12].map((quantity) => itemTaxRate("SWEET_SINGLE_SERVING", quantity))).toEqual([1400, 0, 0]);
    expect(itemTaxRate("ZERO_RATED_GROCERY", 3)).toBe(0);
    expect(itemTaxRate("FULL_CAKE", null)).toBe(0);
    expect(itemTaxRate("WEDDING_CAKE", null)).toBe(0);
    expect(() => itemTaxRate("SWEET_SINGLE_SERVING", null)).toThrow("setup");
    expect(() => itemTaxRate("REQUIRES_REVIEW", 6)).toThrow("setup");
  });
  it("allocates coupon cents deterministically and only to eligible items", () => {
    expect(
      allocateDiscount(2, [
        { grossAmount: 1, discountEligible: true },
        { grossAmount: 1, discountEligible: true },
        { grossAmount: 1, discountEligible: true },
      ]),
    ).toEqual([1, 1, 0]);
    for (let amount = 0; amount <= 99; amount++) {
      const allocated = allocateDiscount(amount, [
        line("a", 100, "FULL_CAKE"),
        line("b", 199, "STANDARD_TAXABLE"),
        line("c", 1000, "STANDARD_TAXABLE", null, false),
      ]);
      expect(allocated.reduce((sum, value) => sum + value, 0)).toBe(amount);
      expect(allocated[2]).toBe(0);
    }
  });
  it("calculates mixed tax after discounts and snapshots all applied rules", () => {
    const result = calculateLineTaxes({
      lines: [line("a", 1000, "STANDARD_TAXABLE"), line("b", 1000, "FULL_CAKE")],
      discount: 200,
      deliveryFee: 1000,
      deliveryTaxMode: "FOLLOW_ORDER_ITEMS",
      enabled: true,
    });
    expect(result.lines.map((item) => [item.allocatedDiscount, item.taxAmount])).toEqual([
      [100, 126],
      [100, 0],
    ]);
    expect(result.deliveryTaxAmount).toBe(70);
    expect(result.total).toBe(196);
    expect(result.jurisdiction).toBe("CA-NS");
    const separate = calculateLineTaxes({
      lines: [line("a", 1000, "FULL_CAKE")],
      discount: 0,
      deliveryFee: 1000,
      deliveryTaxMode: "SEPARATE_TAXABLE_SERVICE",
      enabled: true,
    });
    expect(separate.total).toBe(140);
  });
  it("requires an explicit delivery treatment and leaves past snapshots unchanged", () => {
    expect(() =>
      calculateLineTaxes({
        lines: [line("a", 1000, "FULL_CAKE")],
        discount: 0,
        deliveryFee: 100,
        deliveryTaxMode: null,
        enabled: true,
      }),
    ).toThrow("setup");
    const original = line("a", 1000, "STANDARD_TAXABLE");
    const result = calculateLineTaxes({
      lines: [original],
      discount: 0,
      deliveryFee: 0,
      deliveryTaxMode: null,
      enabled: true,
    });
    original.taxClass = "ZERO_RATED_GROCERY";
    expect(result.lines[0].taxAmount).toBe(140);
  });
});

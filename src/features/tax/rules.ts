import type { TaxClass } from "./types";
/** Owner classification must confirm CRA eligibility, including packaging and serving size. */
export function itemTaxRate(taxClass: TaxClass, packQuantity: number | null): number {
  if (taxClass === "REQUIRES_REVIEW") throw new Error("Tax classification setup is required for this item.");
  if (packQuantity !== null && (!Number.isSafeInteger(packQuantity) || packQuantity < 1))
    throw new Error("Pack quantity needs review.");
  if (taxClass === "SWEET_SINGLE_SERVING") {
    if (packQuantity === null) throw new Error("Pack quantity setup is required for sweet single servings.");
    return packQuantity >= 6 ? 0 : 1400;
  }
  return taxClass === "STANDARD_TAXABLE" ? 1400 : 0;
}

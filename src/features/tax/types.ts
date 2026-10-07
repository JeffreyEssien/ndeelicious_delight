export const taxClasses = [
  "ZERO_RATED_GROCERY",
  "SWEET_SINGLE_SERVING",
  "FULL_CAKE",
  "WEDDING_CAKE",
  "STANDARD_TAXABLE",
  "REQUIRES_REVIEW",
] as const;
export type TaxClass = (typeof taxClasses)[number];
export type DeliveryTaxMode = "SEPARATE_TAXABLE_SERVICE" | "FOLLOW_ORDER_ITEMS";
export type TaxLineInput = {
  id: string;
  grossAmount: number;
  taxClass: TaxClass;
  packQuantity: number | null;
  discountEligible: boolean;
};
export type TaxLineSnapshot = TaxLineInput & {
  allocatedDiscount: number;
  taxableAmount: number;
  rateBps: number;
  taxAmount: number;
};
export type TaxSnapshot = {
  jurisdiction: "CA-NS";
  deliveryTaxMode: DeliveryTaxMode | null;
  lines: TaxLineSnapshot[];
  deliveryTaxAmount: number;
  deliveryRateBps: number;
  total: number;
};

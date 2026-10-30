import { allocateDiscount } from "./allocation";
import { itemTaxRate } from "./rules";
import type { DeliveryTaxMode, TaxLineInput, TaxSnapshot } from "./types";
/** Tax applies to products only. Delivery fees are never taxed; deliveryTaxMode is kept on the snapshot for old orders. */
export function calculateLineTaxes(input: {
  lines: TaxLineInput[];
  discount: number;
  deliveryFee: number;
  deliveryTaxMode: DeliveryTaxMode | null;
  enabled: boolean;
}): TaxSnapshot {
  if (!Number.isSafeInteger(input.deliveryFee) || input.deliveryFee < 0) throw new Error("Invalid delivery fee.");
  const allocation = allocateDiscount(input.discount, input.lines);
  const lines = input.lines.map((line, index) => {
    const allocatedDiscount = allocation[index];
    const taxableAmount = line.grossAmount - allocatedDiscount;
    const rateBps = input.enabled ? itemTaxRate(line.taxClass, line.packQuantity) : 0;
    return {
      ...line,
      allocatedDiscount,
      taxableAmount,
      rateBps,
      taxAmount: Math.round((taxableAmount * rateBps) / 10000),
    };
  });
  return {
    jurisdiction: "CA-NS",
    deliveryTaxMode: input.deliveryTaxMode,
    lines,
    deliveryRateBps: 0,
    deliveryTaxAmount: 0,
    total: lines.reduce((sum, line) => sum + line.taxAmount, 0),
  };
}

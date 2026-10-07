import { allocateDiscount } from "./allocation";
import { itemTaxRate } from "./rules";
import type { DeliveryTaxMode, TaxLineInput, TaxSnapshot } from "./types";
function roundRatio(numerator: bigint, denominator: bigint) {
  return Number((numerator + denominator / BigInt(2)) / denominator);
}
export function calculateLineTaxes(input: {
  lines: TaxLineInput[];
  discount: number;
  deliveryFee: number;
  deliveryTaxMode: DeliveryTaxMode | null;
  enabled: boolean;
}): TaxSnapshot {
  if (!Number.isSafeInteger(input.deliveryFee) || input.deliveryFee < 0) throw new Error("Invalid delivery fee.");
  if (input.enabled && input.deliveryFee > 0 && !input.deliveryTaxMode)
    throw new Error("Delivery tax setup is required.");
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
  const net = lines.reduce((sum, line) => sum + line.taxableAmount, 0);
  const taxableNet = lines.reduce((sum, line) => sum + (line.rateBps ? line.taxableAmount : 0), 0);
  const deliveryRateBps =
    !input.enabled || !input.deliveryFee
      ? 0
      : input.deliveryTaxMode === "SEPARATE_TAXABLE_SERVICE"
        ? 1400
        : net
          ? Math.round((1400 * taxableNet) / net)
          : 0;
  // Preserve precision for proportional mixed-order delivery, then round once.
  const deliveryTaxAmount = !input.enabled
    ? 0
    : input.deliveryTaxMode === "FOLLOW_ORDER_ITEMS"
      ? net
        ? roundRatio(BigInt(input.deliveryFee) * BigInt(1400) * BigInt(taxableNet), BigInt(10000) * BigInt(net))
        : 0
      : Math.round((input.deliveryFee * deliveryRateBps) / 10000);
  return {
    jurisdiction: "CA-NS",
    deliveryTaxMode: input.deliveryTaxMode,
    lines,
    deliveryRateBps,
    deliveryTaxAmount,
    total: lines.reduce((sum, line) => sum + line.taxAmount, 0) + deliveryTaxAmount,
  };
}

import { normalizeCanadianPostalCode, postalFsa } from "./postal-code";
import { FulfilmentError, type DeliveryArea } from "./types";
export function resolveDeliveryArea(postalCode: string, areas: DeliveryArea[], claimedAreaId?: string) {
  const normalized = normalizeCanadianPostalCode(postalCode);
  if (!normalized) throw new FulfilmentError("INVALID_POSTAL_CODE", "Enter a valid Canadian postal code.");
  const matches = areas.filter((area) => area.active && area.postalCodePrefixes.includes(postalFsa(normalized) ?? ""));
  if (!matches.length)
    throw new FulfilmentError("OUTSIDE_DELIVERY_AREA", "Delivery is not available for this postal code.");
  if (matches.length !== 1)
    throw new FulfilmentError("AMBIGUOUS_DELIVERY_AREA", "This delivery area needs review. Please contact the bakery.");
  const area = matches[0];
  if (claimedAreaId && claimedAreaId !== area.id)
    throw new FulfilmentError(
      "DELIVERY_AREA_MISMATCH",
      "Your delivery area has changed. Check your postal code again.",
    );
  return { area, postalCode: normalized, country: "CA" as const, province: "NS" as const };
}
export function deliveryCharge(area: DeliveryArea, subtotal: number) {
  if (!Number.isSafeInteger(subtotal) || subtotal < 0)
    throw new FulfilmentError("INVALID_SUBTOTAL", "The order subtotal needs review.");
  if (subtotal < area.minimumOrder)
    throw new FulfilmentError(
      "DELIVERY_MINIMUM",
      `This area requires a minimum subtotal of ${(area.minimumOrder / 100).toFixed(2)} CAD.`,
    );
  const remaining = area.freeDeliveryThreshold === null ? null : Math.max(0, area.freeDeliveryThreshold - subtotal);
  return { fee: remaining === 0 ? 0 : area.fee, freeDeliveryRemaining: remaining };
}

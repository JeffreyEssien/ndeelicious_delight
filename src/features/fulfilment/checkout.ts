import { deliveryCharge, resolveDeliveryArea } from "./resolver";
import { earliestFulfilment } from "./schedule";
import type { DeliveryArea, FulfilmentSchedule } from "./types";
export function resolveCheckoutFulfilment(input: {
  delivery: { fulfilment: "delivery" | "pickup"; postalCode?: string; zoneId?: string };
  areas: DeliveryArea[];
  subtotal: number;
  preparationHours: number;
  cakeLeadTimeHours?: number;
  schedule: FulfilmentSchedule | null;
  now?: Date;
}) {
  const resolved =
    input.delivery.fulfilment === "delivery"
      ? resolveDeliveryArea(input.delivery.postalCode ?? "", input.areas, input.delivery.zoneId)
      : null;
  const charges = resolved ? deliveryCharge(resolved.area, input.subtotal) : { fee: 0, freeDeliveryRemaining: null };
  const earliest = earliestFulfilment({
    mode: input.delivery.fulfilment,
    schedule: input.schedule,
    area: resolved?.area,
    preparationHours: input.preparationHours,
    cakeLeadTimeHours: input.cakeLeadTimeHours,
    now: input.now,
  });
  return { area: resolved?.area ?? null, postalCode: resolved?.postalCode ?? null, ...charges, ...earliest };
}

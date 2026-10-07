import { earliestFulfilment } from "@/features/fulfilment/schedule";
import { FulfilmentError, type DeliveryArea, type FulfilmentSchedule } from "@/features/fulfilment/types";
import { leadTimeHours } from "./lead-time";
import type { CakeType } from "@/validations/cake-type";
export function cakeAvailability(input: {
  cakeType: CakeType;
  schedule: FulfilmentSchedule | null;
  areas: DeliveryArea[];
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  now?: Date;
  requestedDate?: string;
}) {
  const candidates: ReturnType<typeof earliestFulfilment>[] = [];
  const modes: { mode: "delivery" | "pickup"; area?: DeliveryArea }[] = [];
  if (input.pickupEnabled && input.schedule?.pickupEnabled) modes.push({ mode: "pickup" });
  if (input.deliveryEnabled)
    for (const area of input.areas.filter((item) => item.active && item.postalCodePrefixes.length))
      modes.push({ mode: "delivery", area });
  for (const mode of modes) {
    if (input.requestedDate && input.schedule) {
      const day = new Date(`${input.requestedDate}T12:00:00Z`).getUTCDay();
      const days = mode.mode === "delivery" ? input.schedule.deliveryDays : input.schedule.pickupDays;
      if (
        !days.includes(day) ||
        input.schedule.blackouts.some((blackout) => blackout.active && blackout.date === input.requestedDate)
      )
        continue;
    }
    try {
      candidates.push(
        earliestFulfilment({
          ...mode,
          schedule: input.schedule,
          preparationHours: 0,
          cakeLeadTimeHours: leadTimeHours(input.cakeType),
          now: input.now,
        }),
      );
    } catch (error) {
      if (!(error instanceof FulfilmentError)) throw error;
    }
  }
  candidates.sort((a, b) => a.earliestAt.localeCompare(b.earliestAt));
  if (!candidates.length)
    throw new FulfilmentError(
      "CAKE_AVAILABILITY_SETUP_REQUIRED",
      "Cake fulfilment is unavailable for this date. Check the bakery schedule or contact us.",
    );
  if (input.requestedDate && input.requestedDate < candidates[0].date)
    throw new FulfilmentError("INVALID_CAKE_DATE", `Choose a date on or after ${candidates[0].date}.`);
  return candidates[0];
}

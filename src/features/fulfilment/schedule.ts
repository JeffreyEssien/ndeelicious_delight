import { fulfilmentScheduleSchema } from "./validation";
import { FulfilmentError, type DeliveryArea, type FulfilmentSchedule } from "./types";
function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}
/** Resolve wall time through Intl offsets, including Halifax daylight saving. */
function instant(date: string, time: string, timezone: string) {
  const target = Date.parse(`${date}T${time}:00Z`);
  let result = new Date(target);
  for (let i = 0; i < 3; i++) {
    const parts = localParts(result, timezone);
    const delta = target - Date.parse(`${parts.date}T${parts.time}:00Z`);
    if (!delta) break;
    result = new Date(result.getTime() + delta);
  }
  return result;
}
export function earliestFulfilment(input: {
  mode: "delivery" | "pickup";
  schedule: FulfilmentSchedule | null;
  area?: DeliveryArea;
  preparationHours: number;
  cakeLeadTimeHours?: number;
  now?: Date;
}) {
  const parsed = fulfilmentScheduleSchema.safeParse(input.schedule);
  if (!parsed.success)
    throw new FulfilmentError("SCHEDULE_SETUP_REQUIRED", "Fulfilment schedule setup is required. Contact the bakery.");
  const schedule = parsed.data;
  const now = input.now ?? new Date();
  const hours = Math.max(input.preparationHours, input.cakeLeadTimeHours ?? 0);
  if (!Number.isFinite(hours) || hours < 0)
    throw new FulfilmentError("INVALID_PREPARATION_TIME", "Preparation time needs review.");
  if (input.mode === "pickup" && !schedule.pickupEnabled)
    throw new FulfilmentError("PICKUP_DISABLED", "Pickup is not currently available.");
  if (input.mode === "delivery" && (!input.area?.active || !schedule.deliveryDays.length))
    throw new FulfilmentError("DELIVERY_SETUP_REQUIRED", "Delivery schedule setup is required.");
  const ready = new Date(
    now.getTime() + (hours + (input.mode === "pickup" ? schedule.pickupPreparationBufferHours : 0)) * 3600000,
  );
  const today = localParts(now, schedule.timezone);
  const readyLocal = localParts(ready, schedule.timezone);
  const days = input.mode === "pickup" ? schedule.pickupDays : schedule.deliveryDays;
  const initial = Date.parse(`${readyLocal.date}T12:00:00Z`);
  for (let offset = 0; offset < 370; offset++) {
    const cursor = new Date(initial + offset * 86400000);
    const date = cursor.toISOString().slice(0, 10);
    if (!days.includes(cursor.getUTCDay()) || schedule.blackouts.some((day) => day.active && day.date === date))
      continue;
    if (
      input.mode === "delivery" &&
      date === today.date &&
      (!schedule.sameDayEnabled || !input.area?.sameDayEligible || today.time >= schedule.sameDayCutoff)
    )
      continue;
    const opening = input.mode === "pickup" ? schedule.pickupHours.start : "00:00";
    const closing = input.mode === "pickup" ? schedule.pickupHours.end : "23:59";
    const at = new Date(Math.max(ready.getTime(), instant(date, opening, schedule.timezone).getTime()));
    if (at > instant(date, closing, schedule.timezone)) continue;
    return {
      earliestAt: at.toISOString(),
      date,
      label: new Intl.DateTimeFormat("en-CA", {
        timeZone: schedule.timezone,
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(at),
      reason: hours > 0 ? "Preparation time and the bakery schedule" : "The bakery schedule",
    };
  }
  throw new FulfilmentError("NO_FULFILMENT_DATE", "No fulfilment date is currently available. Contact the bakery.");
}

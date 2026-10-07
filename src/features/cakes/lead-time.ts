import type { CakeType } from "@/validations/cake-type";
export function leadTimeHours(type: Pick<CakeType, "leadTimeValue" | "leadTimeUnit">) {
  return type.leadTimeValue * { hours: 1, days: 24, weeks: 168 }[type.leadTimeUnit];
}
export function leadTimeLabel(type: Pick<CakeType, "leadTimeValue" | "leadTimeUnit">) {
  return `${type.leadTimeValue} ${type.leadTimeValue === 1 ? type.leadTimeUnit.slice(0, -1) : type.leadTimeUnit}`;
}
export function bakeryDate(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
// The picker accepts bakery calendar dates; server and browser use the same boundary.
export function earliestCakeDate(
  type: Pick<CakeType, "leadTimeValue" | "leadTimeUnit">,
  timezone: string,
  now = new Date(),
) {
  return bakeryDate(new Date(now.getTime() + leadTimeHours(type) * 3600000), timezone);
}

import type { CakeType } from "@/validations/cake-type";
export function leadTimeHours(type: Pick<CakeType, "leadTimeValue" | "leadTimeUnit">) {
  return type.leadTimeValue * { hours: 1, days: 24, weeks: 168 }[type.leadTimeUnit];
}

import type { DeliveryZone } from "@/types";
export type DeliveryArea = DeliveryZone & {
  postalCodePrefixes: string[];
  freeDeliveryThreshold: number | null;
  customerNote: string;
  sameDayEligible: boolean;
  sortOrder: number;
};
export type FulfilmentSchedule = {
  timezone: "America/Halifax";
  deliveryDays: number[];
  sameDayEnabled: boolean;
  sameDayCutoff: string;
  defaultEstimate: string;
  blackouts: { date: string; reason: string; active: boolean }[];
  pickupEnabled: boolean;
  pickupAddress: string;
  pickupInstructions: string;
  pickupDays: number[];
  pickupHours: { start: string; end: string };
  pickupPreparationBufferHours: number;
};
export class FulfilmentError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "FulfilmentError";
  }
}

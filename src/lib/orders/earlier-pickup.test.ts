import { describe, expect, it } from "vitest";
import type { FulfilmentSchedule } from "@/features/fulfilment/types";
import { earlierPickup } from "./earlier-pickup";

const schedule: FulfilmentSchedule = {
  timezone: "America/Halifax",
  deliveryDays: [],
  sameDayEnabled: false,
  sameDayCutoff: "12:00",
  defaultEstimate: "",
  blackouts: [],
  pickupEnabled: true,
  pickupAddress: "56 Supreme Ct",
  pickupInstructions: "",
  pickupDays: [0, 1, 2, 3, 4, 5, 6],
  pickupHours: { start: "09:00", end: "17:00" },
  pickupPreparationBufferHours: 0,
};
// Placed Monday 10:00 Halifax; pickup was only on Saturdays, so it was due Saturday.
const placedAt = new Date("2026-11-02T14:00:00Z");
const saturday = new Date("2026-11-07T13:00:00Z");

describe("earlier pickup", () => {
  it("brings an order forward when the new schedule has an earlier day", () => {
    const slot = earlierPickup({ schedule, placedAt, preparationHours: 0, current: saturday, now: placedAt });
    expect(slot?.date).toBe("2026-11-03");
  });
  it("leaves the order alone when nothing earlier is open", () => {
    const saturdaysOnly = { ...schedule, pickupDays: [6] };
    expect(earlierPickup({ schedule: saturdaysOnly, placedAt, preparationHours: 0, current: saturday })).toBeNull();
  });
  it("never offers a time in the past or before the order's preparation is done", () => {
    const now = new Date("2026-11-05T22:00:00Z"); // Thursday 6 p.m., after pickup closes
    expect(earlierPickup({ schedule, placedAt, preparationHours: 0, current: saturday, now })?.date).toBe("2026-11-06");
    expect(earlierPickup({ schedule, placedAt, preparationHours: 96, current: saturday, now: placedAt })?.date).toBe(
      "2026-11-06",
    );
  });
});

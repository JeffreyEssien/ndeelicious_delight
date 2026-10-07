import { describe, expect, it } from "vitest";
import { normalizeCanadianPostalCode, postalFsa } from "./postal-code";
import { resolveDeliveryArea, deliveryCharge } from "./resolver";
import { earliestFulfilment } from "./schedule";
import { deliveryAreasSchema } from "./validation";
import type { DeliveryArea, FulfilmentSchedule } from "./types";
const area: DeliveryArea = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Halifax",
  fee: 1000,
  minimumOrder: 2000,
  freeDeliveryThreshold: 5000,
  estimate: "",
  active: true,
  postalCodePrefixes: ["B3H"],
  customerNote: "",
  sameDayEligible: true,
  sortOrder: 0,
};
const schedule: FulfilmentSchedule = {
  timezone: "America/Halifax",
  deliveryDays: [0, 1, 2, 3, 4, 5, 6],
  sameDayEnabled: true,
  sameDayCutoff: "12:00",
  defaultEstimate: "",
  blackouts: [],
  pickupEnabled: true,
  pickupAddress: "Owner's address",
  pickupInstructions: "",
  pickupDays: [0, 1, 2, 3, 4, 5, 6],
  pickupHours: { start: "09:00", end: "17:00" },
  pickupPreparationBufferHours: 0,
};
describe("postal delivery", () => {
  it("normalizes Canadian postal codes and rejects forbidden letters", () => {
    expect(normalizeCanadianPostalCode("b3h2y5")).toBe("B3H 2Y5");
    expect(postalFsa("b3h 2y5")).toBe("B3H");
    for (const value of ["D3H 2Y5", "B3I2Y5", "B3H-2Y5", "invalid", "B3H"])
      expect(normalizeCanadianPostalCode(value)).toBeNull();
  });
  it("rejects outside, inactive, overlapping and tampered areas", () => {
    expect(resolveDeliveryArea("B3H2Y5", [area]).area.id).toBe(area.id);
    expect(() => resolveDeliveryArea("M5V2T6", [area])).toThrow("not available");
    expect(() => resolveDeliveryArea("B3H2Y5", [{ ...area, active: false }])).toThrow("not available");
    expect(() => resolveDeliveryArea("B3H2Y5", [area, { ...area, id: "other" }])).toThrow("needs review");
    expect(() => resolveDeliveryArea("B3H2Y5", [area], "other")).toThrow("changed");
    expect(deliveryAreasSchema.safeParse([area, { ...area, id: "22222222-2222-4222-8222-222222222222" }]).success).toBe(
      false,
    );
  });
  it("charges the live fee and waives it exactly at the threshold", () => {
    expect(deliveryCharge(area, 4999)).toEqual({ fee: 1000, freeDeliveryRemaining: 1 });
    expect(deliveryCharge(area, 5000)).toEqual({ fee: 0, freeDeliveryRemaining: 0 });
    expect(() => deliveryCharge(area, 1999)).toThrow("minimum");
  });
});
describe("Halifax fulfilment dates", () => {
  it("handles cutoff, area eligibility, blackouts and closed weekdays", () => {
    const now = new Date("2026-10-07T15:00:00Z"); // noon ADT
    expect(earliestFulfilment({ mode: "delivery", area, schedule, preparationHours: 0, now }).date).toBe("2026-10-08");
    expect(
      earliestFulfilment({
        mode: "delivery",
        area,
        schedule: {
          ...schedule,
          deliveryDays: [5],
          blackouts: [{ date: "2026-10-09", reason: "Closed", active: true }],
        },
        preparationHours: 0,
        now,
      }).date,
    ).toBe("2026-10-16");
    expect(
      earliestFulfilment({
        mode: "delivery",
        area: { ...area, sameDayEligible: false },
        schedule,
        preparationHours: 0,
        now: new Date("2026-10-07T13:00:00Z"),
      }).date,
    ).toBe("2026-10-08");
  });
  it("uses the longest prep rule, pickup hours, and daylight saving offsets", () => {
    expect(
      earliestFulfilment({ mode: "pickup", schedule, preparationHours: 48, now: new Date("2026-10-07T21:00:00Z") })
        .earliestAt,
    ).toBe("2026-10-10T12:00:00.000Z");
    expect(
      earliestFulfilment({
        mode: "pickup",
        schedule,
        preparationHours: 48,
        cakeLeadTimeHours: 168,
        now: new Date("2026-10-07T12:00:00Z"),
      }).date,
    ).toBe("2026-10-14");
    expect(
      earliestFulfilment({ mode: "pickup", schedule, preparationHours: 0, now: new Date("2026-11-02T10:00:00Z") })
        .earliestAt,
    ).toBe("2026-11-02T13:00:00.000Z");
  });
  it("does not invent availability when configuration is absent", () => {
    expect(() => earliestFulfilment({ mode: "pickup", schedule: null, preparationHours: 0 })).toThrow("setup");
  });
});

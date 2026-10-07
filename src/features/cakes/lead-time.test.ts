import { describe, expect, it } from "vitest";
import { earliestCakeDate, leadTimeHours, leadTimeLabel } from "./lead-time";
import { cakeTypeSchema } from "@/validations/cake-type";
const type = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Wedding Cake",
  slug: "wedding-cake",
  description: "",
  leadTimeValue: 3,
  leadTimeUnit: "weeks" as const,
  active: true,
  sortOrder: 0,
  image: "",
  customerNotice: "",
};
describe("cake type lead times", () => {
  it("uses the bakery date around UTC midnight", () => {
    expect(earliestCakeDate(type, "America/Halifax", new Date("2026-10-08T01:00:00Z"))).toBe("2026-10-28");
    expect(earliestCakeDate({ ...type, leadTimeValue: 4 }, "America/Halifax", new Date("2026-10-08T01:00:00Z"))).toBe(
      "2026-11-04",
    );
  });
  it("normalizes units and preserves friendly labels", () => {
    expect(leadTimeHours(type)).toBe(504);
    expect(leadTimeLabel(type)).toBe("3 weeks");
    expect(leadTimeHours({ ...type, leadTimeUnit: "hours" })).toBe(3);
  });
  it("rejects unconfigured active types without a fallback", () => {
    expect(cakeTypeSchema.safeParse({ ...type, leadTimeValue: 0 }).success).toBe(false);
    expect(cakeTypeSchema.safeParse({ ...type, leadTimeValue: 0, active: false }).success).toBe(true);
    expect(cakeTypeSchema.safeParse({ ...type, leadTimeValue: Number.NaN }).success).toBe(false);
  });
});

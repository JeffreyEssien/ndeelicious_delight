import { describe, expect, it } from "vitest";
import { leadTimeHours } from "./lead-time";
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
  it("normalizes units", () => {
    expect(leadTimeHours(type)).toBe(504);
    expect(leadTimeHours({ ...type, leadTimeUnit: "hours" })).toBe(3);
  });
  it("rejects unconfigured active types without a fallback", () => {
    expect(cakeTypeSchema.safeParse({ ...type, leadTimeValue: 0 }).success).toBe(false);
    expect(cakeTypeSchema.safeParse({ ...type, leadTimeValue: 0, active: false }).success).toBe(true);
    expect(cakeTypeSchema.safeParse({ ...type, leadTimeValue: Number.NaN }).success).toBe(false);
  });
});

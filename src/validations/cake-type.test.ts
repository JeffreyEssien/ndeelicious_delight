import { describe, expect, it } from "vitest";
import { cakeTypeSchema } from "./cake-type";
const cake = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Birthday cake",
  slug: "birthday-cake",
  description: "",
  basePrice: null,
  taxClass: "REQUIRES_REVIEW",
  leadTimeValue: 0,
  leadTimeUnit: "days",
  active: false,
  sortOrder: 0,
  image: "",
  customerNotice: "",
};
describe("cake draft publication", () => {
  it("allows a draft with incomplete commercial setup", () => {
    expect(cakeTypeSchema.safeParse(cake).success).toBe(true);
  });
  it("requires confirmed tax classification to publish", () => {
    expect(cakeTypeSchema.safeParse({ ...cake, active: true, basePrice: 1000, leadTimeValue: 3 }).success).toBe(false);
  });
  it("allows fully configured publication without inventing a price", () => {
    expect(
      cakeTypeSchema.safeParse({ ...cake, active: true, basePrice: 1000, leadTimeValue: 3, taxClass: "FULL_CAKE" })
        .success,
    ).toBe(true);
  });
});

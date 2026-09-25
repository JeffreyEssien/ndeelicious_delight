import { describe, expect, it } from "vitest";
import { cakeUploadSchema } from "./cake";
import { checkoutSchema } from "./checkout";

const customer = { name: "Taylor Smith", email: "taylor@example.com", phone: "+1 416 555 0123" };
const cart = [{ productId: "p1", variantId: "v1", quantity: 1 }];

describe("checkout validation", () => {
  it("accepts a complete guest pickup", () => {
    expect(checkoutSchema.safeParse({ customer, delivery: { fulfilment: "pickup" }, cart }).success).toBe(true);
  });

  it("accepts a complete Canadian delivery address", () => {
    expect(
      checkoutSchema.safeParse({
        customer,
        delivery: {
          fulfilment: "delivery",
          zoneId: "11111111-1111-4111-8111-111111111111",
          street: "100 Queen Street West",
          addressLine2: "Unit 4",
          city: "Toronto",
          province: "ON",
          postalCode: "M5H 2N2",
          country: "CA",
        },
        cart,
      }).success,
    ).toBe(true);
  });

  it("rejects delivery without a Canadian postal address", () => {
    expect(
      checkoutSchema.safeParse({
        customer,
        delivery: { fulfilment: "delivery", zoneId: "", province: "ON", postalCode: "10001" },
        cart,
      }).success,
    ).toBe(false);
  });

  it("rejects executable cake uploads", () => {
    expect(cakeUploadSchema.safeParse({ name: "cake.exe", size: 100, type: "application/octet-stream" }).success).toBe(
      false,
    );
  });
});

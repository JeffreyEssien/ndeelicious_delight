import { describe, expect, it } from "vitest";
import { calculateOrderQuote, CommerceError } from "./pricing";
import { products } from "@/test/fixtures";
const cart = [{ productId: "p2", variantId: "v1", quantity: 3 }];
const coupon = {
  code: "TEST10",
  type: "PERCENTAGE" as const,
  value: 10,
  minimumOrder: 1000000,
  maximumDiscount: 500000,
  active: true,
};
describe("calculateOrderQuote", () => {
  it("uses server catalogue prices and adds delivery", () => {
    const quote = calculateOrderQuote({ cart, products, fulfilment: "delivery", deliveryFee: 250000 });
    expect(quote.subtotal).toBe(1350000);
    expect(quote.grandTotal).toBe(1600000);
  });
  it("never adds a fee for pickup", () => {
    const quote = calculateOrderQuote({ cart, products, fulfilment: "pickup", deliveryFee: 999999 });
    expect(quote.deliveryFee).toBe(0);
  });
  it("applies capped percentage coupons", () => {
    const quote = calculateOrderQuote({
      cart: [{ productId: "p1", variantId: "v3", quantity: 1 }],
      products,
      fulfilment: "pickup",
      coupon,
    });
    expect(quote.discount).toBe(500000);
  });
  it("rejects insufficient stock", () => {
    expect(() =>
      calculateOrderQuote({
        cart: [{ productId: "p4", variantId: "v1", quantity: 7 }],
        products,
        fulfilment: "pickup",
      }),
    ).toThrowError(CommerceError);
  });
  it("does not impose stock limits when inventory tracking is disabled", () => {
    const unlimited = {
      ...products[1],
      trackInventory: false,
      stockQuantity: 0,
      variants: products[1].variants.map((variant) => ({ ...variant, stockQuantity: 0 })),
    };
    const quote = calculateOrderQuote({
      cart: [{ productId: unlimited.id, variantId: unlimited.variants[0].id, quantity: 50 }],
      products: [unlimited],
      fulfilment: "pickup",
    });
    expect(quote.lines[0].quantity).toBe(50);
  });
  it("rejects expired coupons", () => {
    expect(() =>
      calculateOrderQuote({
        cart,
        products,
        fulfilment: "pickup",
        coupon: { ...coupon, expiresAt: new Date("2025-01-01") },
        now: new Date("2026-01-01"),
      }),
    ).toThrowError(/expired/);
  });
  it("enforces store-wide and delivery-zone minimums", () => {
    expect(() =>
      calculateOrderQuote({
        cart: [{ productId: "p2", variantId: "v1", quantity: 1 }],
        products,
        fulfilment: "delivery",
        deliveryFee: 250000,
        orderMinimum: 400000,
        deliveryMinimum: 1000000,
      }),
    ).toThrowError(/delivery area requires/);
    expect(() =>
      calculateOrderQuote({
        cart: [{ productId: "p2", variantId: "v1", quantity: 1 }],
        products,
        fulfilment: "pickup",
        orderMinimum: 1000000,
      }),
    ).toThrowError(/requires a subtotal/);
  });
  it("applies product and category restrictions as an intersection", () => {
    const quote = calculateOrderQuote({
      cart: [
        { productId: "p1", variantId: "v3", quantity: 1 },
        { productId: "p2", variantId: "v1", quantity: 1 },
      ],
      products,
      fulfilment: "pickup",
      coupon: {
        ...coupon,
        minimumOrder: 0,
        maximumDiscount: undefined,
        productIds: ["p1", "p2"],
        categoryIds: ["22222222-2222-4222-8222-222222222222"],
      },
    });
    expect(quote.discount).toBe(45000);
  });
  it("rejects disabled fulfilment methods", () => {
    expect(() => calculateOrderQuote({ cart, products, fulfilment: "delivery", deliveryEnabled: false })).toThrowError(
      /not currently available/,
    );
    expect(() => calculateOrderQuote({ cart, products, fulfilment: "pickup", pickupEnabled: false })).toThrowError(
      /not currently available/,
    );
  });
  it("calculates configured tax after discounts and optionally taxes delivery", () => {
    const quote = calculateOrderQuote({
      cart: [{ productId: "p2", variantId: "v1", quantity: 1 }],
      products,
      fulfilment: "delivery",
      deliveryFee: 2_000,
      taxEnabled: true,
      taxRateBps: 1_300,
      taxDelivery: true,
    });
    expect(quote.taxTotal).toBe(Math.round(((quote.subtotal + 2_000) * 1_300) / 10_000));
    expect(quote.grandTotal).toBe(quote.subtotal + quote.deliveryFee + quote.taxTotal);
  });
  it("rejects an invalid configured tax rate", () => {
    expect(() =>
      calculateOrderQuote({
        cart,
        products,
        fulfilment: "pickup",
        taxEnabled: true,
        taxRateBps: 10_001,
      }),
    ).toThrowError(/tax rate needs review/);
  });
});

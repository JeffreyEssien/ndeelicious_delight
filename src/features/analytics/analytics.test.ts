import { describe, expect, it } from "vitest";
import { calculateAnalytics, type AnalyticsSource } from "./analytics";

const source: AnalyticsSource = {
  orders: [
    {
      id: "one",
      email: "returning@example.com",
      status: "DELIVERED",
      createdAt: "2026-09-20T12:00:00.000Z",
      fulfilment: "delivery",
      deliveryZoneId: "zone",
      couponId: "coupon",
      subtotal: 10_000,
      discountTotal: 1_000,
      deliveryFee: 500,
      taxTotal: 0,
      grandTotal: 9_500,
      payment: {
        status: "PARTIALLY_REFUNDED",
        amount: 9_500,
        refundedAmount: 1_500,
        paidAt: "2026-09-20T13:00:00.000Z",
      },
      lines: [{ productId: "cake", productName: "Cake", quantity: 2, finalPrice: 10_000 }],
      events: [{ eventType: "STATUS_CHANGED", toStatus: "DELIVERED", createdAt: "2026-09-21T12:00:00.000Z" }],
    },
    {
      id: "two",
      email: "returning@example.com",
      status: "PAID",
      createdAt: "2026-09-25T12:00:00.000Z",
      fulfilment: "pickup",
      deliveryZoneId: null,
      couponId: null,
      subtotal: 5_000,
      discountTotal: 0,
      deliveryFee: 0,
      taxTotal: 650,
      grandTotal: 5_650,
      payment: { status: "SUCCEEDED", amount: 5_650, refundedAmount: 0, paidAt: "2026-09-25T12:30:00.000Z" },
      lines: [{ productId: "pastry", productName: "Pastry", quantity: 1, finalPrice: 5_000 }],
      events: [],
    },
  ],
  cakes: [{ status: "QUOTE_SENT", createdAt: "2026-09-24T12:00:00.000Z", quotedTotal: 20_000, orderId: null }],
  coupons: [{ id: "coupon", code: "WELCOME" }],
  reviews: [{ rating: 5, status: "APPROVED", createdAt: "2026-09-26T12:00:00.000Z" }],
  notifications: [{ status: "SENT", createdAt: "2026-09-25T13:00:00.000Z", sentAt: "2026-09-25T13:01:00.000Z" }],
  events: [
    { eventName: "PRODUCT_VIEWED", anonymousId: "one", productId: "cake", createdAt: "2026-09-25T10:00:00.000Z" },
    { eventName: "ADD_TO_CART", anonymousId: "one", productId: "cake", createdAt: "2026-09-25T10:01:00.000Z" },
    { eventName: "CHECKOUT_STARTED", anonymousId: "one", productId: null, createdAt: "2026-09-25T10:02:00.000Z" },
  ],
  products: [],
  zones: [{ id: "zone", name: "Toronto", fee: 500, minimumOrder: 0, estimate: "Next day", active: true }],
  activeSubscribers: 12,
  unresolvedContacts: 2,
  capped: false,
  eventTrackingAvailable: true,
};

describe("calculateAnalytics", () => {
  it("uses successful payments and refunds as the financial source of truth", () => {
    const analytics = calculateAnalytics(source, new Date("2026-10-01T00:00:00.000Z"));
    expect(analytics.periods["30d"].grossRevenue).toBe(15_150);
    expect(analytics.periods["30d"].refunds).toBe(1_500);
    expect(analytics.periods["30d"].netRevenue).toBe(13_650);
    expect(analytics.periods["30d"].averageOrderValue).toBe(6_825);
  });

  it("calculates repeat customers, product, coupon and delivery performance", () => {
    const period = calculateAnalytics(source, new Date("2026-10-01T00:00:00.000Z")).periods["30d"];
    expect(period.repeatCustomerRate).toBe(100);
    expect(period.products[0]).toMatchObject({ name: "Cake", units: 2, revenue: 10_000 });
    expect(period.coupons[0]).toMatchObject({ code: "WELCOME", orders: 1, discounts: 1_000 });
    expect(period.deliveryZones[0]).toMatchObject({ name: "Toronto", orders: 1 });
  });

  it("reports cake pipeline and operational timing without customer details", () => {
    const period = calculateAnalytics(source, new Date("2026-10-01T00:00:00.000Z")).periods["30d"];
    expect(period.cakePipelineValue).toBe(20_000);
    expect(period.averageHoursToPaid).toBe(0.75);
    expect(period.averageHoursToDelivered).toBe(24);
    expect(period.notificationSuccessRate).toBe(100);
    expect(period.productToCartRate).toBe(100);
    expect(period.cartToCheckoutRate).toBe(100);
  });
});

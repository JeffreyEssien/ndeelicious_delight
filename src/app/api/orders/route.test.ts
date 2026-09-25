import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/types";

const product: Product = {
  id: "product-id",
  slug: "test-croissant",
  name: "Test <Croissant>",
  shortDescription: "Fresh pastry",
  description: "Fresh pastry",
  category: "PASTRIES",
  price: 500_000,
  image: "/pastries.jpg",
  status: "ACTIVE",
  stockQuantity: 10,
  lowStockThreshold: 2,
  variants: [{ id: "variant-id", name: "Single <large>", sku: "NDE-00000001", priceAdjustment: 0, stockQuantity: 10 }],
  ingredients: "Flour",
  allergens: ["Wheat"],
};

const mocks = vi.hoisted(() => ({
  customerResult: vi.fn(),
  orderResult: vi.fn(),
  addressInsert: vi.fn(),
  itemInsert: vi.fn(),
  paymentInsert: vi.fn(),
  reserveInventory: vi.fn(),
  cleanupEq: vi.fn(),
  sendEmail: vi.fn(),
  getCoupon: vi.fn(),
  claimOrderCoupon: vi.fn(),
  createStripeCheckout: vi.fn(),
  expireStripeCheckout: vi.fn(),
  queueNotification: vi.fn(),
  deliverNotification: vi.fn(),
}));

vi.mock("next/server", () => ({ after: (callback: () => unknown) => callback() }));

vi.mock("@/lib/data/catalog", () => ({
  getProducts: () => Promise.resolve([product]),
  getDeliveryZones: () => Promise.resolve([]),
}));
vi.mock("@/lib/data/coupons", () => ({
  getCoupon: mocks.getCoupon,
  claimOrderCoupon: mocks.claimOrderCoupon,
}));
vi.mock("@/lib/data/settings", () => ({
  getBusinessSettings: () =>
    Promise.resolve({
      orderMinimum: 0,
      deliveryEnabled: true,
      pickupEnabled: true,
      currency: "CAD",
      locale: "en-CA",
      taxEnabled: false,
      taxRateBps: 0,
      taxDelivery: true,
    }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "customers") {
        return { upsert: () => ({ select: () => ({ single: mocks.customerResult }) }) };
      }
      if (table === "delivery_addresses") return { insert: mocks.addressInsert };
      if (table === "orders") {
        return {
          insert: () => ({ select: () => ({ single: mocks.orderResult }) }),
          delete: () => ({ eq: mocks.cleanupEq }),
        };
      }
      if (table === "order_items") return { insert: mocks.itemInsert, delete: () => ({ eq: mocks.cleanupEq }) };
      if (table === "coupon_usages") return { delete: () => ({ eq: mocks.cleanupEq }) };
      if (table === "payments") {
        return { insert: mocks.paymentInsert, delete: () => ({ eq: mocks.cleanupEq }) };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));
vi.mock("@/lib/data/inventory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/inventory")>()),
  reserveOrderInventory: mocks.reserveInventory,
}));
vi.mock("@/lib/email/mailer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/mailer")>()),
  sendTransactionalEmail: mocks.sendEmail,
}));
vi.mock("@/lib/payments/stripe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments/stripe")>()),
  createStripeCheckout: mocks.createStripeCheckout,
  expireStripeCheckout: mocks.expireStripeCheckout,
}));
vi.mock("@/lib/orders/notifications", () => ({
  queueOrderNotification: mocks.queueNotification,
  deliverOrderNotification: mocks.deliverNotification,
}));

import { POST } from "./route";

describe("POST /api/orders", () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ADMIN_EMAIL", "owner@example.com");
    mocks.customerResult.mockResolvedValue({ data: { id: "customer-id" }, error: null });
    mocks.orderResult.mockResolvedValue({ data: { id: "order-id", order_number: "ND-12345678" }, error: null });
    mocks.addressInsert.mockResolvedValue({ error: null });
    mocks.itemInsert.mockResolvedValue({ error: null });
    mocks.paymentInsert.mockResolvedValue({ error: null });
    mocks.reserveInventory.mockResolvedValue(new Date("2026-09-23T10:00:00Z"));
    mocks.cleanupEq.mockResolvedValue({ error: null });
    mocks.sendEmail.mockResolvedValue({ sent: true });
    mocks.getCoupon.mockResolvedValue(undefined);
    mocks.claimOrderCoupon.mockResolvedValue(undefined);
    mocks.createStripeCheckout.mockResolvedValue({
      id: "cs_test_order",
      url: "https://checkout.stripe.test/order",
      expiresAt: 1_800_000_000,
    });
    mocks.expireStripeCheckout.mockResolvedValue(undefined);
    mocks.queueNotification.mockResolvedValue("notification-id");
    mocks.deliverNotification.mockResolvedValue(true);
  });

  it("returns the specific safe validation error instead of an opaque 400", async () => {
    const response = await POST(
      new Request("http://localhost/api/orders", {
        method: "POST",
        body: JSON.stringify({
          customer: { name: "A", email: "ada@example.com", phone: "08012345678" },
          delivery: { fulfilment: "pickup" },
          cart: [{ productId: "product-id", variantId: "variant-id", quantity: 2 }],
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Tell us who the order is for.",
      field: "customer.name",
      code: "INVALID_ORDER_DETAILS",
    });
    expect(mocks.customerResult).not.toHaveBeenCalled();
  });

  it("creates an order and a server-owned Stripe Checkout session", async () => {
    const response = await POST(
      new Request("http://localhost/api/orders", {
        method: "POST",
        body: JSON.stringify({
          customer: { name: "Ada <baker>", email: "ada@example.com", phone: "08012345678" },
          delivery: { fulfilment: "pickup" },
          cart: [{ productId: "product-id", variantId: "variant-id", quantity: 2 }],
        }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      order: { number: "ND-12345678", total: 1_000_000, status: "PENDING_PAYMENT" },
      payment: { checkoutUrl: "https://checkout.stripe.test/order" },
    });
    expect(mocks.itemInsert).toHaveBeenCalledOnce();
    expect(mocks.itemInsert).toHaveBeenCalledWith([expect.objectContaining({ sku: "NDE-00000001", quantity: 2 })]);
    expect(mocks.reserveInventory).toHaveBeenCalledWith(expect.anything(), "order-id", 60);
    expect(mocks.createStripeCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "order-id", amount: 1_000_000, currency: "CAD" }),
    );
    expect(mocks.paymentInsert).toHaveBeenCalledOnce();
    expect(mocks.queueNotification).toHaveBeenCalledWith(expect.anything(), "order-id", "ORDER_RECEIVED");
    expect(mocks.deliverNotification).toHaveBeenCalledWith(expect.anything(), "notification-id");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("returns a conflict and removes the incomplete order when the atomic reservation loses a stock race", async () => {
    const { InventoryConflictError } = await import("@/lib/data/inventory");
    mocks.reserveInventory.mockRejectedValueOnce(new InventoryConflictError());

    const response = await POST(
      new Request("http://localhost/api/orders", {
        method: "POST",
        body: JSON.stringify({
          customer: { name: "Ada", email: "ada@example.com", phone: "08012345678" },
          delivery: { fulfilment: "pickup" },
          cart: [{ productId: "product-id", variantId: "variant-id", quantity: 2 }],
        }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(mocks.cleanupEq).toHaveBeenCalledTimes(4);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("claims coupon capacity through the database before confirming the order", async () => {
    mocks.getCoupon.mockResolvedValueOnce({
      id: "coupon-id",
      code: "SAVE10",
      type: "PERCENTAGE",
      value: 10,
      minimumOrder: 0,
      active: true,
    });

    const response = await POST(
      new Request("http://localhost/api/orders", {
        method: "POST",
        body: JSON.stringify({
          customer: { name: "Ada", email: "ada@example.com", phone: "08012345678" },
          delivery: { fulfilment: "pickup" },
          cart: [{ productId: "product-id", variantId: "variant-id", quantity: 2 }],
          couponCode: "SAVE10",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.claimOrderCoupon).toHaveBeenCalledWith(expect.anything(), "order-id", 60);
  });

  it("removes an incomplete order when coupon capacity is lost", async () => {
    const { CommerceError } = await import("@/features/checkout/pricing");
    mocks.getCoupon.mockResolvedValueOnce({
      id: "coupon-id",
      code: "LASTONE",
      type: "FIXED",
      value: 10000,
      minimumOrder: 0,
      active: true,
    });
    mocks.claimOrderCoupon.mockRejectedValueOnce(
      new CommerceError("COUPON_USED_UP", "That coupon has reached its usage limit."),
    );

    const response = await POST(
      new Request("http://localhost/api/orders", {
        method: "POST",
        body: JSON.stringify({
          customer: { name: "Ada", email: "ada@example.com", phone: "08012345678" },
          delivery: { fulfilment: "pickup" },
          cart: [{ productId: "product-id", variantId: "variant-id", quantity: 2 }],
          couponCode: "LASTONE",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "COUPON_USED_UP" });
    expect(mocks.cleanupEq).toHaveBeenCalledTimes(4);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});

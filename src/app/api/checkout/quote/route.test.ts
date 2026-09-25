import { describe, expect, it, vi } from "vitest";
import { products as testProducts } from "@/test/fixtures";

vi.mock("@/lib/data/catalog", () => ({
  getProducts: () => Promise.resolve(testProducts),
  getDeliveryZones: () =>
    Promise.resolve([
      { id: "dz1", name: "Central", fee: 250000, minimumOrder: 0, estimate: "Scheduled", active: true },
      { id: "dz2", name: "Outer", fee: 400000, minimumOrder: 2000000, estimate: "Scheduled", active: true },
    ]),
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

vi.mock("@/lib/data/coupons", () => ({
  getCoupon: (code?: string) =>
    Promise.resolve(
      code === "SWEET10" ? { code, type: "PERCENTAGE", value: 10, minimumOrder: 0, active: true } : undefined,
    ),
}));

import { POST } from "./route";

const valid = {
  customer: { name: "Amara O", email: "amara@example.com", phone: "08012345678" },
  delivery: {
    fulfilment: "delivery",
    zoneId: "dz1",
    street: "12 King Street",
    city: "Toronto",
    province: "ON",
    postalCode: "M5H 1A1",
    country: "CA",
  },
  cart: [{ productId: "p2", variantId: "v1", quantity: 3 }],
  couponCode: "SWEET10",
};

describe("POST /api/checkout/quote", () => {
  it("rebuilds the total on the server", async () => {
    const res = await POST(
      new Request("http://localhost/api/checkout/quote", { method: "POST", body: JSON.stringify(valid) }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.quote.grandTotal).toBe(1465000);
  });

  it("rejects unknown delivery zones", async () => {
    const res = await POST(
      new Request("http://localhost/api/checkout/quote", {
        method: "POST",
        body: JSON.stringify({ ...valid, delivery: { ...valid.delivery, zoneId: "fake" } }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns conflict when stock changed", async () => {
    const res = await POST(
      new Request("http://localhost/api/checkout/quote", {
        method: "POST",
        body: JSON.stringify({
          ...valid,
          cart: [{ productId: "p4", variantId: "v1", quantity: 10 }],
          couponCode: undefined,
        }),
      }),
    );
    expect(res.status).toBe(409);
  });

  it("rejects a cart below the selected delivery-zone minimum", async () => {
    const res = await POST(
      new Request("http://localhost/api/checkout/quote", {
        method: "POST",
        body: JSON.stringify({ ...valid, delivery: { ...valid.delivery, zoneId: "dz2" } }),
      }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ code: "DELIVERY_MINIMUM" });
  });

  it("rejects cross-origin quote requests", async () => {
    const res = await POST(
      new Request("http://localhost/api/checkout/quote", {
        method: "POST",
        headers: { origin: "https://example.invalid" },
        body: JSON.stringify(valid),
      }),
    );
    expect(res.status).toBe(403);
  });
});

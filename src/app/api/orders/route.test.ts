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
  variants: [{ id: "variant-id", name: "Single <large>", priceAdjustment: 0, stockQuantity: 10 }],
  ingredients: "Flour",
  allergens: ["Wheat"],
};

const mocks = vi.hoisted(() => ({
  customerResult: vi.fn(),
  orderResult: vi.fn(),
  addressInsert: vi.fn(),
  itemInsert: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/data/catalog", () => ({
  getProducts: () => Promise.resolve([product]),
  getDeliveryZones: () => Promise.resolve([]),
}));
vi.mock("@/lib/data/coupons", () => ({ getCoupon: () => Promise.resolve(undefined) }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "customers") {
        return { upsert: () => ({ select: () => ({ single: mocks.customerResult }) }) };
      }
      if (table === "delivery_addresses") return { insert: mocks.addressInsert };
      if (table === "orders") {
        return { insert: () => ({ select: () => ({ single: mocks.orderResult }) }) };
      }
      if (table === "order_items") return { insert: mocks.itemInsert };
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));
vi.mock("@/lib/email/resend", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/email/resend")>(),
  sendTransactionalEmail: mocks.sendEmail,
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
    mocks.sendEmail.mockResolvedValue({ sent: true });
  });

  it("creates an order and safely emails the customer and owner", async () => {
    const response = await POST(new Request("http://localhost/api/orders", {
      method: "POST",
      body: JSON.stringify({
        customer: { name: "Ada <baker>", email: "ada@example.com", phone: "08012345678" },
        delivery: { fulfilment: "pickup" },
        cart: [{ productId: "product-id", variantId: "variant-id", quantity: 2 }],
      }),
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      order: { number: "ND-12345678", total: 1_000_000, status: "PENDING_PAYMENT" },
    });
    expect(mocks.itemInsert).toHaveBeenCalledOnce();
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    for (const [email] of mocks.sendEmail.mock.calls) {
      expect(email.html).toContain("Ada &lt;baker&gt;");
      expect(email.html).toContain("Test &lt;Croissant&gt;");
      expect(email.html).toContain("Single &lt;large&gt;");
      expect(email.html).not.toContain("Ada <baker>");
    }
  });
});

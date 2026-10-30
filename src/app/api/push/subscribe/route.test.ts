import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  save: vi.fn(),
  configured: vi.fn(),
  lookup: vi.fn(),
  filters: [] as [string, unknown][],
}));
vi.mock("@/lib/security/rate-limit", () => ({ enforcePublicRateLimit: mocks.rateLimit }));
vi.mock("@/lib/push/send", () => ({
  isPushConfigured: mocks.configured,
  saveSubscription: mocks.save,
  removeSubscription: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          mocks.filters.push([`${table}.${column}`, value]);
          return query;
        },
        maybeSingle: () => mocks.lookup(table),
      };
      return query;
    },
  }),
}));

import { POST } from "./route";

const subscription = { endpoint: "https://push.example/abc", keys: { p256dh: "key", auth: "auth" } };
const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/push/subscribe", {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/push/subscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.filters.length = 0;
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost");
    mocks.rateLimit.mockResolvedValue(null);
    mocks.configured.mockReturnValue(true);
    mocks.save.mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("needs proof that the order belongs to the customer", async () => {
    expect((await post({ subscription, orderNumber: "ND-1001" })).status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("refuses an order number with the wrong email", async () => {
    mocks.lookup.mockResolvedValue({ data: null });
    const response = await post({ subscription, orderNumber: "ND-1001", email: "someone@else.test" });
    expect(response.status).toBe(404);
    expect(mocks.filters).toContainEqual(["orders.email", "someone@else.test"]);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("subscribes with the order number and its email", async () => {
    mocks.lookup.mockResolvedValue({ data: { id: "order-1" } });
    const response = await post({ subscription, orderNumber: "nd-1001", email: "Ada@Example.test" });
    expect(response.status).toBe(201);
    expect(mocks.filters).toEqual(
      expect.arrayContaining([
        ["orders.order_number", "ND-1001"],
        ["orders.email", "ada@example.test"],
      ]),
    );
    expect(mocks.save).toHaveBeenCalledWith(
      expect.anything(),
      { audience: "customer", orderId: "order-1" },
      subscription,
    );
  });

  it("subscribes from the success page with the Stripe session for that order", async () => {
    mocks.lookup.mockResolvedValue({ data: { orders: { id: "order-2", order_number: "ND-1002" } } });
    const response = await post({ subscription, orderNumber: "ND-1002", sessionId: "cs_test_abc123" });
    expect(response.status).toBe(201);
    expect(mocks.filters).toEqual(
      expect.arrayContaining([
        ["payments.provider_payment_id", "cs_test_abc123"],
        ["payments.orders.order_number", "ND-1002"],
      ]),
    );
    expect(mocks.save).toHaveBeenCalledWith(
      expect.anything(),
      { audience: "customer", orderId: "order-2" },
      subscription,
    );
  });

  it("is unavailable until push is set up", async () => {
    mocks.configured.mockReturnValue(false);
    expect((await post({ subscription, orderNumber: "ND-1001", email: "ada@example.test" })).status).toBe(503);
  });
});

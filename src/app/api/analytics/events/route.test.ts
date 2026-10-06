import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ insert: vi.fn() }));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ from: () => ({ insert: mocks.insert }) }),
}));
vi.mock("@/lib/security/rate-limit", () => ({ enforcePublicRateLimit: vi.fn().mockResolvedValue(null) }));

import { POST } from "./route";

describe("POST /api/analytics/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockResolvedValue({ error: null });
  });

  it("stores an anonymous allow-listed commerce event", async () => {
    const occurredAt = new Date().toISOString();
    const response = await POST(
      new Request("http://localhost/api/analytics/events", {
        method: "POST",
        headers: { origin: "http://localhost", "content-type": "application/json" },
        body: JSON.stringify({
          eventName: "ADD_TO_CART",
          anonymousId: "ec3f1f31-67df-4f99-95b2-72e8bfcd7761",
          productId: "8e7ab3bd-00ba-4dc6-98ba-b0a47b5cf746",
          path: "/product/berry-cake",
          metadata: { quantity: 2 },
          occurredAt,
        }),
      }),
    );

    expect(response.status).toBe(204);
    expect(mocks.insert).toHaveBeenCalledWith({
      event_name: "ADD_TO_CART",
      anonymous_id: "ec3f1f31-67df-4f99-95b2-72e8bfcd7761",
      product_id: "8e7ab3bd-00ba-4dc6-98ba-b0a47b5cf746",
      path: "/product/berry-cake",
      metadata: { quantity: 2 },
      occurred_at: occurredAt,
    });
  });

  it("rejects unknown events and excessive metadata", async () => {
    const response = await POST(
      new Request("http://localhost/api/analytics/events", {
        method: "POST",
        headers: { origin: "http://localhost", "content-type": "application/json" },
        body: JSON.stringify({
          eventName: "EMAIL_CAPTURED",
          anonymousId: "ec3f1f31-67df-4f99-95b2-72e8bfcd7761",
          path: "/",
          metadata: { email: "customer@example.com" },
          occurredAt: new Date().toISOString(),
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

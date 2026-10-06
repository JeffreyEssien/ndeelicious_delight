import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ rpc: mocks.rpc }),
}));

import { enforcePublicRateLimit } from "./rate-limit";

describe("public rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ADMIN_AUTH_SECRET", "test-secret-that-is-longer-than-thirty-two-characters");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("uses a hashed requester key and allows a request within the limit", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ allowed: true, retry_after: 60 }], error: null });
    const response = await enforcePublicRateLimit(
      new Request("https://example.com/api/contact", {
        headers: { "x-real-ip": "203.0.113.9", "user-agent": "Browser" },
      }),
      { scope: "contact", maximum: 5, windowSeconds: 3600 },
    );

    expect(response).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "consume_public_rate_limit",
      expect.objectContaining({
        p_scope: "contact",
        p_window_seconds: 3600,
        p_max_requests: 5,
        p_key_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("203.0.113.9");
  });

  it("returns 429 with the database retry interval after the limit", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ allowed: false, retry_after: 37.2 }], error: null });
    const response = await enforcePublicRateLimit(new Request("https://example.com/api/contact"), {
      scope: "contact",
      maximum: 5,
      windowSeconds: 3600,
    });

    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe("38");
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
  });

  it("fails closed when the durable limiter is unavailable", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("database unavailable") });
    const response = await enforcePublicRateLimit(new Request("https://example.com/api/contact"), {
      scope: "contact",
      maximum: 5,
      windowSeconds: 3600,
    });

    expect(response?.status).toBe(503);
  });
});

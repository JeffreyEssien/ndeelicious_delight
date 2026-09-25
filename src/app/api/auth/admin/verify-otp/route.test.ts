import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashOtpCode } from "@/lib/auth/admin-session";

const mocks = vi.hoisted(() => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.createServiceClient }));

import { POST } from "./route";

function chain(final: object) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(final)),
  };
  return builder;
}

describe("POST /api/auth/admin/verify-otp", () => {
  beforeEach(() => vi.stubEnv("ADMIN_AUTH_SECRET", "test-secret-that-is-at-least-thirty-two-characters"));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("consumes a valid code and creates an opaque HttpOnly session", async () => {
    const challengeId = "11111111-1111-4111-8111-111111111111";
    const code = "123456";
    let insertedSession: Record<string, unknown> | undefined;
    let challengeCall = 0;
    const db = {
      from: vi.fn((table: string) => {
        if (table === "admins") return chain({ data: { id: "admin-id" }, error: null });
        if (table === "admin_sessions") {
          return {
            insert: vi.fn((value: Record<string, unknown>) => {
              insertedSession = value;
              return Promise.resolve({ error: null });
            }),
          };
        }
        challengeCall += 1;
        if (challengeCall === 1) {
          return chain({
            data: {
              id: challengeId,
              admin_id: "admin-id",
              code_hash: hashOtpCode(challengeId, code),
              attempts: 0,
              max_attempts: 5,
              expires_at: new Date(Date.now() + 60_000).toISOString(),
            },
            error: null,
          });
        }
        return { update: vi.fn(() => chain({ data: { id: challengeId }, error: null })) };
      }),
    };
    mocks.createServiceClient.mockReturnValue(db);

    const response = await POST(
      new Request("https://example.com/api/auth/admin/verify-otp", {
        method: "POST",
        headers: { origin: "https://example.com", "content-type": "application/json" },
        body: JSON.stringify({ email: "owner@example.com", token: code }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("ndee_admin_session=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=strict");
    expect(insertedSession?.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(String(insertedSession?.token_hash)).not.toContain(code);
  });

  it("does not create a session for an invalid code", async () => {
    const challengeId = "11111111-1111-4111-8111-111111111111";
    let challengeCall = 0;
    const db = {
      from: vi.fn((table: string) => {
        if (table === "admin_sessions") throw new Error("must not create a session");
        challengeCall += 1;
        if (challengeCall === 1) {
          return chain({
            data: {
              id: challengeId,
              admin_id: "admin-id",
              code_hash: hashOtpCode(challengeId, "123456"),
              attempts: 0,
              max_attempts: 5,
              expires_at: new Date(Date.now() + 60_000).toISOString(),
            },
            error: null,
          });
        }
        return { update: vi.fn(() => chain({ data: { id: challengeId }, error: null })) };
      }),
    };
    mocks.createServiceClient.mockReturnValue(db);

    const response = await POST(
      new Request("https://example.com/api/auth/admin/verify-otp", {
        method: "POST",
        headers: { origin: "https://example.com", "content-type": "application/json" },
        body: JSON.stringify({ email: "owner@example.com", token: "654321" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

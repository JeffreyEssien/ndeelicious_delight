import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  isMailerConfigured: vi.fn(() => true),
  sendTransactionalEmail: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock("@/lib/email/mailer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/mailer")>()),
  isMailerConfigured: mocks.isMailerConfigured,
  sendTransactionalEmail: mocks.sendTransactionalEmail,
}));

import { POST } from "./route";

function query(result: object) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => Promise.resolve(result)),
    is: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

describe("POST /api/auth/admin/request-otp", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_AUTH_SECRET", "test-secret-that-is-at-least-thirty-two-characters");
    mocks.sendTransactionalEmail.mockResolvedValue({ sent: true, id: "message-id" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("keeps unknown admin accounts private and stores only hashed challenge data", async () => {
    let challengeCall = 0;
    let inserted: Record<string, unknown> | undefined;
    const db = {
      from: vi.fn((table: string) => {
        if (table === "admins") {
          return query({ data: null, error: null });
        }
        challengeCall += 1;
        if (challengeCall <= 2) return query({ count: 0, error: null });
        if (challengeCall === 3) return { update: vi.fn(() => query({ error: null })) };
        return {
          insert: vi.fn((value: Record<string, unknown>) => {
            inserted = value;
            return Promise.resolve({ error: null });
          }),
        };
      }),
    };
    mocks.createServiceClient.mockReturnValue(db);

    const response = await POST(
      new Request("https://example.com/api/auth/admin/request-otp", {
        method: "POST",
        headers: { origin: "https://example.com", "content-type": "application/json" },
        body: JSON.stringify({ email: "unknown@example.com" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(inserted).toMatchObject({ admin_id: null, max_attempts: 5 });
    expect(inserted?.recipient_hash).not.toContain("unknown@example.com");
    expect(inserted?.code_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("rejects requests after the durable recipient limit", async () => {
    const db = { from: vi.fn(() => query({ count: 5, error: null })) };
    mocks.createServiceClient.mockReturnValue(db);

    const response = await POST(
      new Request("https://example.com/api/auth/admin/request-otp", {
        method: "POST",
        headers: { origin: "https://example.com", "content-type": "application/json" },
        body: JSON.stringify({ email: "owner@example.com" }),
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("900");
  });
});

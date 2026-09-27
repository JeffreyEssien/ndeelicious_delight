import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ rpc: mocks.rpc }) }));

import { POST } from "./route";

const token = "a-valid-opaque-document-token-that-is-long-enough";

describe("POST /api/documents/quotes/respond", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: { state: "ACCEPTED" }, error: null });
  });

  it("delegates acceptance to the atomic idempotent database operation", async () => {
    const response = await POST(
      new Request("http://localhost/api/documents/quotes/respond", {
        method: "POST",
        body: JSON.stringify({ token, response: "ACCEPTED" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "respond_to_quote",
      expect.objectContaining({ p_response: "ACCEPTED", p_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    );
  });

  it("returns a calm unavailable state for revoked, expired, or stale links", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "QUOTE_NOT_AVAILABLE" } });
    const response = await POST(
      new Request("http://localhost/api/documents/quotes/respond", {
        method: "POST",
        body: JSON.stringify({ token, response: "DECLINED" }),
      }),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("no longer available") });
  });

  it("rejects short or malformed tokens before database access", async () => {
    const response = await POST(
      new Request("http://localhost/api/documents/quotes/respond", {
        method: "POST",
        body: JSON.stringify({ token: "short", response: "ACCEPTED" }),
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

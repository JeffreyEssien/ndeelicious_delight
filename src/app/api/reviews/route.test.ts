import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), readToken: vi.fn() }));

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/reviews/invitations", () => ({ readReviewToken: mocks.readToken }));

import { POST } from "./route";

const review = {
  token: "11111111-1111-4111-8111-111111111111.signature-value-long-enough",
  rating: 5,
  title: "Wonderful",
  body: "The cake tasted wonderful and arrived beautifully presented.",
};

describe("POST /api/reviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readToken.mockReturnValue("11111111-1111-4111-8111-111111111111");
    mocks.rpc.mockResolvedValue({ data: "review-id", error: null });
  });

  it("persists a review through a verified single-use invitation", async () => {
    const response = await POST(
      new Request("http://localhost/api/reviews", { method: "POST", body: JSON.stringify(review) }),
    );
    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith("submit_verified_review", {
      p_invitation_id: "11111111-1111-4111-8111-111111111111",
      p_rating: 5,
      p_title: "Wonderful",
      p_body: review.body,
    });
  });

  it("rejects a review without a valid purchase invitation", async () => {
    mocks.readToken.mockReturnValue(null);
    const response = await POST(
      new Request("http://localhost/api/reviews", { method: "POST", body: JSON.stringify(review) }),
    );
    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects incomplete reviews", async () => {
    const response = await POST(new Request("http://localhost/api/reviews", { method: "POST", body: "{}" }));
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

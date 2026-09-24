import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ productResult: vi.fn(), reviewInsert: vi.fn() }));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "products") return { select: () => ({ eq: () => ({ in: () => ({ maybeSingle: mocks.productResult }) }) }) };
      if (table === "reviews") return { insert: mocks.reviewInsert };
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

import { POST } from "./route";

const review = {
  productId: "11111111-1111-4111-8111-111111111111",
  customerName: "Ada Baker",
  rating: 5,
  title: "Wonderful",
  body: "The cake tasted wonderful and arrived beautifully presented.",
};

describe("POST /api/reviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.productResult.mockResolvedValue({ data: { id: review.productId }, error: null });
    mocks.reviewInsert.mockResolvedValue({ error: null });
  });

  it("persists a valid review for moderation", async () => {
    const response = await POST(new Request("http://localhost/api/reviews", { method: "POST", body: JSON.stringify(review) }));
    expect(response.status).toBe(201);
    expect(mocks.reviewInsert).toHaveBeenCalledWith(expect.objectContaining({ status: "PENDING", rating: 5 }));
  });

  it("rejects incomplete reviews", async () => {
    const response = await POST(new Request("http://localhost/api/reviews", { method: "POST", body: "{}" }));
    expect(response.status).toBe(400);
    expect(mocks.reviewInsert).not.toHaveBeenCalled();
  });
});

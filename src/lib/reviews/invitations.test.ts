import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReviewToken, readReviewToken } from "./invitations";

describe("verified review invitation tokens", () => {
  beforeEach(() => vi.stubEnv("REVIEW_TOKEN_SECRET", "review-secret-that-is-at-least-thirty-two-characters"));
  afterEach(() => vi.unstubAllEnvs());

  it("round-trips a signed invitation id", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(readReviewToken(createReviewToken(id))).toBe(id);
  });

  it("rejects a modified token", () => {
    const token = createReviewToken("11111111-1111-4111-8111-111111111111");
    expect(readReviewToken(`${token}x`)).toBeNull();
  });
});

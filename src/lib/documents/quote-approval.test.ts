import { afterEach, describe, expect, it, vi } from "vitest";
import { signQuoteApproval, verifyQuoteApproval } from "./quote-approval";
afterEach(() => vi.unstubAllEnvs());
describe("quote preview approval", () => {
  it("binds the request, amount, revision and expiration to a signed preview", () => {
    vi.stubEnv("ADMIN_AUTH_SECRET", "test-secret-with-more-than-32-characters");
    const approval = {
      requestId: "cake-a",
      quotedTotal: 12000,
      revision: 3,
      updatedAt: "2026-10-11",
      expiresAt: Date.now() + 60000,
    };
    const token = signQuoteApproval(approval);
    expect(verifyQuoteApproval(token, "cake-a", 12000)).toEqual(approval);
    expect(() => verifyQuoteApproval(token, "cake-b", 12000)).toThrow();
    expect(() => verifyQuoteApproval(token, "cake-a", 12001)).toThrow();
    expect(() => verifyQuoteApproval(`${token}x`, "cake-a", 12000)).toThrow();
    expect(() => verifyQuoteApproval(signQuoteApproval({ ...approval, expiresAt: 0 }), "cake-a", 12000)).toThrow();
  });
});

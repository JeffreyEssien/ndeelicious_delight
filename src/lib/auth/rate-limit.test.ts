import { beforeEach, describe, expect, it } from "vitest";
import { consumeOtpAttempt, resetOtpRateLimitsForTests } from "./rate-limit";

describe("OTP request rate limiting", () => {
  beforeEach(resetOtpRateLimitsForTests);

  it("blocks attempts above the configured limit", () => {
    expect(consumeOtpAttempt("admin", 0, 2, 60_000).allowed).toBe(true);
    expect(consumeOtpAttempt("admin", 1, 2, 60_000).allowed).toBe(true);
    expect(consumeOtpAttempt("admin", 2, 2, 60_000)).toEqual({ allowed: false, retryAfter: 60 });
  });

  it("opens a fresh window after expiry", () => {
    consumeOtpAttempt("admin", 0, 1, 1000);
    expect(consumeOtpAttempt("admin", 1000, 1, 1000).allowed).toBe(true);
  });
});

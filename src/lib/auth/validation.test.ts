import { describe, expect, it } from "vitest";
import { isSameOrigin, requestOtpSchema, verifyOtpSchema } from "./validation";

describe("admin OTP validation", () => {
  it("normalizes valid admin emails", () => {
    expect(requestOtpSchema.parse({ email: " Owner@Example.COM " })).toEqual({ email: "owner@example.com" });
  });

  it("requires exactly six numeric OTP characters", () => {
    expect(verifyOtpSchema.safeParse({ email: "owner@example.com", token: "123456" }).success).toBe(true);
    expect(verifyOtpSchema.safeParse({ email: "owner@example.com", token: "12345a" }).success).toBe(false);
  });

  it("rejects cross-origin browser requests", () => {
    expect(isSameOrigin(new Request("https://shop.example.com/api", { headers: { origin: "https://evil.example" } }))).toBe(false);
    expect(isSameOrigin(new Request("https://shop.example.com/api", { headers: { origin: "https://shop.example.com" } }))).toBe(true);
  });
});

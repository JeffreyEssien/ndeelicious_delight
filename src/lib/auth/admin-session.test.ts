import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminSessionCookieOptions,
  createAdminSession,
  fingerprint,
  generateOtpCode,
  hashOtpCode,
  REMEMBERED_SESSION_TTL_MS,
  readAdminSessionCookie,
  SESSION_TTL_MS,
  verifyOtpCode,
} from "./admin-session";

describe("first-party admin authentication primitives", () => {
  beforeEach(() => vi.stubEnv("ADMIN_AUTH_SECRET", "test-secret-that-is-at-least-thirty-two-characters"));
  afterEach(() => vi.unstubAllEnvs());

  it("generates and verifies six-digit OTPs without storing the code", () => {
    const code = generateOtpCode();
    const hash = hashOtpCode("challenge-id", code);
    expect(code).toMatch(/^\d{6}$/);
    expect(hash).not.toContain(code);
    expect(verifyOtpCode("challenge-id", code, hash)).toBe(true);
    const wrongCode = code === "000000" ? "000001" : "000000";
    expect(verifyOtpCode("challenge-id", wrongCode, hash)).toBe(false);
  });

  it("signs opaque expiring session cookies", () => {
    const session = createAdminSession(1_000);
    expect(readAdminSessionCookie(session.cookieValue, 2_000)?.tokenHash).toBe(session.tokenHash);
    expect(readAdminSessionCookie(`${session.cookieValue}tampered`, 2_000)).toBeNull();
    expect(readAdminSessionCookie(session.cookieValue, session.expiresAt.getTime())).toBeNull();
  });

  it("keeps remembered sessions for 30 days and drops the cookie expiry otherwise", () => {
    expect(createAdminSession(0).expiresAt.getTime()).toBe(SESSION_TTL_MS);
    const remembered = createAdminSession(0, true);
    expect(remembered.expiresAt.getTime()).toBe(REMEMBERED_SESSION_TTL_MS);
    expect(readAdminSessionCookie(remembered.cookieValue, 29 * 24 * 60 * 60_000)).not.toBeNull();
    expect(adminSessionCookieOptions(remembered.expiresAt, true).expires).toEqual(remembered.expiresAt);
    expect(adminSessionCookieOptions(remembered.expiresAt, false)).not.toHaveProperty("expires");
  });

  it("creates stable non-reversible request fingerprints", () => {
    expect(fingerprint("Owner@Example.com")).toBe(fingerprint(" owner@example.com "));
    expect(fingerprint("owner@example.com")).not.toContain("owner@example.com");
  });
});

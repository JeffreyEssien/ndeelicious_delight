import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "ndee_admin_session";
export const OTP_TTL_MS = 10 * 60_000;
export const SESSION_TTL_MS = 8 * 60 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;

function secret() {
  const value = process.env.ADMIN_AUTH_SECRET?.trim();
  if (!value || value.length < 32) throw new Error("ADMIN_AUTH_SECRET must contain at least 32 characters.");
  return value;
}

function hmac(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

function safeHexEqual(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function generateOtpCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtpCode(challengeId: string, code: string) {
  return hmac(`otp:${challengeId}:${code}`);
}

export function verifyOtpCode(challengeId: string, code: string, expectedHash: string) {
  return safeHexEqual(hashOtpCode(challengeId, code), expectedHash);
}

export function fingerprint(value: string) {
  return hmac(`fingerprint:${value.trim().toLowerCase()}`);
}

export function createAdminSession(now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now + SESSION_TTL_MS);
  const expires = Math.floor(expiresAt.getTime() / 1000);
  const payload = `${token}.${expires}`;
  return {
    tokenHash: hmac(`session:${token}`),
    cookieValue: `${payload}.${hmac(`cookie:${payload}`)}`,
    expiresAt,
  };
}

export function readAdminSessionCookie(value: string | undefined, now = Date.now()) {
  if (!value) return null;
  const [token, expiresValue, signature, ...extra] = value.split(".");
  if (!token || !expiresValue || !signature || extra.length) return null;
  const expires = Number(expiresValue);
  if (!Number.isSafeInteger(expires) || expires * 1000 <= now) return null;
  const payload = `${token}.${expiresValue}`;
  if (!safeHexEqual(hmac(`cookie:${payload}`), signature)) return null;
  return { tokenHash: hmac(`session:${token}`), expiresAt: new Date(expires * 1000) };
}

export function adminSessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    expires,
    priority: "high" as const,
  };
}

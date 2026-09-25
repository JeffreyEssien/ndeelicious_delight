import { createHmac, timingSafeEqual } from "node:crypto";

function reviewSecret() {
  const value = (process.env.REVIEW_TOKEN_SECRET || process.env.ADMIN_AUTH_SECRET)?.trim();
  if (!value || value.length < 32) throw new Error("REVIEW_TOKEN_SECRET must contain at least 32 characters.");
  return value;
}

function signature(id: string) {
  return createHmac("sha256", reviewSecret()).update(`review-invitation:${id}`).digest("base64url");
}

export function createReviewToken(id: string) {
  return `${id}.${signature(id)}`;
}

export function readReviewToken(token: string) {
  const [id, supplied, extra] = token.split(".");
  if (extra || !id || !supplied || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const expected = signature(id);
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right) ? id : null;
}

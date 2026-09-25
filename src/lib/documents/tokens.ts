import { createHmac, timingSafeEqual } from "node:crypto";

function secret() {
  const value = (process.env.DOCUMENT_TOKEN_SECRET || process.env.ADMIN_AUTH_SECRET)?.trim();
  if (!value || value.length < 32) throw new Error("DOCUMENT_TOKEN_SECRET must contain at least 32 characters.");
  return value;
}

export function createDocumentToken(kind: string, reference: string) {
  return createHmac("sha256", secret()).update(`document:${kind}:${reference}`).digest("base64url");
}

export function verifyDocumentToken(kind: string, reference: string, supplied: string) {
  const expected = createDocumentToken(kind, reference);
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

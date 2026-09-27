import { createHash, randomBytes } from "node:crypto";

export const DOCUMENT_TOKEN_BYTES = 32;

export function hashDocumentToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createDocumentAccessToken() {
  const token = randomBytes(DOCUMENT_TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashDocumentToken(token) };
}

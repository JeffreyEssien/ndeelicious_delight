import { describe, expect, it } from "vitest";
import { createDocumentAccessToken, DOCUMENT_TOKEN_BYTES, hashDocumentToken } from "./tokens";

describe("customer document tokens", () => {
  it("creates opaque high-entropy values and stores only stable hashes", () => {
    const first = createDocumentAccessToken();
    const second = createDocumentAccessToken();
    expect(Buffer.from(first.token, "base64url")).toHaveLength(DOCUMENT_TOKEN_BYTES);
    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).toHaveLength(64);
    expect(hashDocumentToken(first.token)).toBe(first.tokenHash);
    expect(hashDocumentToken(second.token)).not.toBe(first.tokenHash);
  });
});

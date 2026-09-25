import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDocumentToken, verifyDocumentToken } from "./tokens";

describe("customer document tokens", () => {
  beforeEach(() => vi.stubEnv("DOCUMENT_TOKEN_SECRET", "document-secret-that-is-at-least-thirty-two-characters"));
  afterEach(() => vi.unstubAllEnvs());

  it("binds the signature to document type and reference", () => {
    const token = createDocumentToken("receipt", "ND-12345678");
    expect(verifyDocumentToken("receipt", "ND-12345678", token)).toBe(true);
    expect(verifyDocumentToken("quote", "ND-12345678", token)).toBe(false);
    expect(verifyDocumentToken("receipt", "ND-87654321", token)).toBe(false);
  });
});

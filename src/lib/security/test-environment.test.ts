import { describe, expect, it } from "vitest";
import { validateBrowserEnvironment } from "./test-environment";

describe("browser environment isolation", () => {
  it("allows unprivileged local responsive coverage", () => {
    expect(() => validateBrowserEnvironment({})).not.toThrow();
  });
  it("requires explicit isolation for remote targets and privileged fixtures", () => {
    for (const env of [
      { PLAYWRIGHT_BASE_URL: "https://staging.example.com" },
      { PLAYWRIGHT_ADMIN_STORAGE_STATE: "admin.json" },
      { PLAYWRIGHT_DOCUMENT_PATH: "/documents/test" },
    ])
      expect(() => validateBrowserEnvironment(env)).toThrow("Confirm isolated");
  });
  it("rejects the production canonical origin even with an isolation flag", () => {
    expect(() =>
      validateBrowserEnvironment({
        PLAYWRIGHT_BASE_URL: "https://bakery.example.com",
        NEXT_PUBLIC_SITE_URL: "https://bakery.example.com",
        PLAYWRIGHT_ISOLATED_ENVIRONMENT: "true",
      }),
    ).toThrow("production canonical");
  });
  it("rejects cross-origin token fixtures", () => {
    for (const path of [
      "https://production.example.com/document",
      "//production.example.com/document",
      "/\\production.example.com/document",
    ]) {
      expect(() =>
        validateBrowserEnvironment({
          PLAYWRIGHT_ISOLATED_ENVIRONMENT: "true",
          PLAYWRIGHT_DOCUMENT_PATH: path,
        }),
      ).toThrow("relative path");
    }
  });
  it("allows explicitly isolated staging with local fixture paths", () => {
    expect(() =>
      validateBrowserEnvironment({
        PLAYWRIGHT_BASE_URL: "https://staging.example.com",
        PLAYWRIGHT_ISOLATED_ENVIRONMENT: "true",
        PLAYWRIGHT_DOCUMENT_PATH: "/documents/test?token=fixture",
      }),
    ).not.toThrow();
  });
});

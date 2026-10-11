import { afterEach, expect, it, vi } from "vitest";
import { documentLogoUrl } from "./branding";
afterEach(() => vi.unstubAllEnvs());
it("uses the same supported branding for HTML and PDF without arbitrary remote requests", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://storage.example.test");
  expect(documentLogoUrl("/brand-logo.jpg")).toBe("/brand-logo.jpg");
  expect(documentLogoUrl("/custom-logo.png")).toBe("/custom-logo.png");
  expect(documentLogoUrl("https://storage.example.test/storage/v1/object/public/logos/logo.png")).toContain(
    "storage.example.test",
  );
  for (const url of [
    "https://other.example/logo.jpg",
    "//other.example/logo.jpg",
    "/logo.svg",
    "/\\other.example/logo.jpg",
    "/%5cother.example/logo.jpg",
    "/%2e%2e/private.jpg",
    "https://storage.example.test/logo.png",
  ])
    expect(documentLogoUrl(url)).toBe("/brand-logo.jpg");
});

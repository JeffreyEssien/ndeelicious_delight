import { afterEach, describe, expect, it, vi } from "vitest";
import { getSiteUrl } from "./site-url";

afterEach(() => vi.unstubAllEnvs());

describe("getSiteUrl", () => {
  it("normalizes the configured public URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", " https://cakes.example.com/ ");
    expect(getSiteUrl()).toBe("https://cakes.example.com");
  });

  it("uses the Vercel URL when the public URL is blank", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_URL", "preview.vercel.app");
    expect(getSiteUrl()).toBe("https://preview.vercel.app");
  });
});

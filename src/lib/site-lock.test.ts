import { describe, expect, it } from "vitest";
import { isOpenWhileLocked, isSiteLocked, lockedResponse } from "./site-lock";

describe("site lock", () => {
  it("is only on when SITE_LOCKED says so", () => {
    expect(isSiteLocked("true")).toBe(true);
    expect(isSiteLocked(" 1 ")).toBe(true);
    expect(isSiteLocked("ON")).toBe(true);
    expect(isSiteLocked(undefined)).toBe(false);
    expect(isSiteLocked("")).toBe(false);
    expect(isSiteLocked("false")).toBe(false);
  });

  it("keeps the admin, its sign-in and outside services working", () => {
    for (const path of [
      "/admin",
      "/admin/login",
      "/admin/orders",
      "/api/admin/products",
      "/api/auth/admin/request-otp",
      "/api/stripe/webhook",
      "/api/resend/webhook",
      "/api/cron/notifications",
      "/api/integrations/products",
      "/robots.txt",
    ]) {
      expect(isOpenWhileLocked(path), path).toBe(true);
    }
  });

  it("closes the customer pages and APIs", () => {
    for (const path of [
      "/",
      "/shop",
      "/product/cake",
      "/checkout",
      "/documents/orders/ND-1",
      "/api/orders",
      "/api/checkout/quote",
      "/api/payments/status",
      "/administrator",
      "/api/adminx",
    ]) {
      expect(isOpenWhileLocked(path), path).toBe(false);
    }
  });

  it("answers pages with HTML and APIs with JSON, both 503", async () => {
    const page = lockedResponse("/shop");
    expect(page.status).toBe(503);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(await page.text()).toContain("check back soon");

    const api = lockedResponse("/api/orders");
    expect(api.status).toBe(503);
    expect(await api.json()).toHaveProperty("error");
  });
});

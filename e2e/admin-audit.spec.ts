import AxeBuilder from "@axe-core/playwright";
import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
test("admin layout audit across themes and workspaces", async ({ page, context }, testInfo) => {
  test.skip(process.env.NDEE_BROWSER_FIXTURES !== "true", "Requires local fixtures.");
  test.setTimeout(180000);
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100");
  expect(["localhost", "127.0.0.1"]).toContain(origin.hostname);
  const payload = `fixture-token.${Math.floor(Date.now() / 1000) + 3600}`;
  const signature = createHmac("sha256", "isolated-ndee-browser-secret-32-characters")
    .update(`cookie:${payload}`)
    .digest("hex");
  await context.addCookies([
    { name: "ndee_admin_session", value: `${payload}.${signature}`, url: origin.origin, httpOnly: true },
  ]);
  await page.request.post("http://127.0.0.1:4545/__fixtures/reset");
  for (const theme of ["berry", "purple", "sunrise"]) {
    const response = await page.request.post("/api/admin/mutate", { data: { action: "theme", theme } });
    expect(response.ok()).toBe(true);
    for (const section of ["orders", "custom-cakes", "inventory", "products", "settings"]) {
      await page.goto(`/admin/${section}`);
      await expect(page.locator(".admin-page h1")).toBeVisible();
      await expect(page.locator("body")).toHaveClass(/admin-mode/);
      const dimensions = await page.evaluate(() => ({
        width: innerWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(dimensions.content, `${theme}/${section}`).toBeLessThanOrEqual(dimensions.width + 1);
      if (theme === "berry") {
        const result = await new AxeBuilder({ page }).analyze();
        expect(
          result.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? "")),
          section,
        ).toEqual([]);
      }
      await page.screenshot({ path: testInfo.outputPath(`${theme}-${section}.png`), fullPage: true });
    }
  }
  for (const section of [
    "",
    "analytics",
    "customers",
    "coupons",
    "reviews",
    "content",
    "carousel",
    "marketing",
    "delivery",
    "audit",
  ]) {
    await page.goto(`/admin/${section}`);
    await expect(page.locator(".admin-page h1")).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      width: innerWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content, section).toBeLessThanOrEqual(dimensions.width + 1);
  }
});

import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

test("compact products, wrapped delivery settings and minute preparation persist", async ({
  page,
  context,
}, testInfo) => {
  test.skip(process.env.NDEE_BROWSER_FIXTURES !== "true", "Isolated fixtures only.");
  test.setTimeout(60000);
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100");
  expect(["localhost", "127.0.0.1"]).toContain(origin.hostname);
  const payload = `fixture-token.${Math.floor(Date.now() / 1000) + 3600}`;
  const signature = createHmac("sha256", "isolated-ndee-browser-secret-32-characters")
    .update(`cookie:${payload}`)
    .digest("hex");
  await context.addCookies([
    { name: "ndee_admin_session", value: `${payload}.${signature}`, url: origin.origin, httpOnly: true },
  ]);
  await page.request.post("http://127.0.0.1:4545/__fixtures/reset");
  await page.goto("/admin/products");
  await expect(page.locator(".products-table tbody tr").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if ((page.viewportSize()?.width ?? 1440) <= 768)
    expect(
      await page
        .locator(".products-table tbody tr")
        .first()
        .evaluate((el) => el.getBoundingClientRect().height),
    ).toBeLessThan(520);
  await page.screenshot({ path: testInfo.outputPath("products.png"), fullPage: true });
  const row = page.locator("tr").filter({ hasText: "Classic Butter Croissant" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit Classic Butter Croissant" });
  await editor.getByLabel("Preparation unit").selectOption("minutes");
  await editor.getByLabel("Preparation time", { exact: true }).fill("45");
  await expect(editor.getByLabel("Preparation unit")).toHaveValue("minutes");
  await editor.getByRole("button", { name: /Save/ }).last().click();
  await expect(editor).not.toBeVisible();
  await page.reload();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(editor.getByLabel("Preparation time", { exact: true })).toHaveValue("45");
  await editor.getByLabel("Preparation unit").selectOption("hours");
  await expect(editor.getByLabel("Preparation time", { exact: true })).toHaveValue("0.75");
  await editor.getByLabel("Preparation unit").selectOption("minutes");
  await expect(editor.getByLabel("Preparation time", { exact: true })).toHaveValue("45");
  await page.screenshot({ path: testInfo.outputPath("preparation-minutes.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await page.goto("/product/classic-butter-croissant");
  await expect(page.getByText(/Preparation: 45 minutes/)).toBeVisible();
  await page.goto("/admin/delivery");
  await expect(page.getByRole("heading", { name: "Delivery schedule" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator(".dw-days")).toHaveCount(2);
  const days = page.locator(".dw-day-pills button");
  await expect(days).toHaveCount(14);
  for (const day of await days.all()) {
    const box = await day.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(page.viewportSize()?.width ?? 1440);
  }
  await page.screenshot({ path: testInfo.outputPath("delivery.png"), fullPage: true });
});

test("payment email entry waits for an explicit click and handles completed payment safely", async ({
  page,
}, testInfo) => {
  test.skip(process.env.NDEE_BROWSER_FIXTURES !== "true", "Isolated fixtures only.");
  let attempts = 0;
  await page.route("**/api/payments/retry", (route) => {
    attempts++;
    return route.fulfill({
      status: 409,
      json: { error: "Payment has been submitted. We are confirming it; please do not pay again." },
    });
  });
  await page.goto("/pay?session=cs_test_expired");
  await expect(page.getByRole("heading", { name: "Complete your order" })).toBeVisible();
  expect(attempts).toBe(0);
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page.locator(".payment-entry [role=alert]")).toContainText("please do not pay again");
  expect(attempts).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("payment-entry.png"), fullPage: true });
});

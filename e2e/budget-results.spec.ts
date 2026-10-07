import { expect, test } from "@playwright/test";

test.skip(process.env.NDEE_BROWSER_FIXTURES !== "true", "Requires the isolated fixture server.");

for (const width of [320, 360, 375, 390, 430]) {
  test(`budget result journey at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.route("**/api/analytics/events", (route) => route.fulfill({ status: 204 }));
    await page.goto("/shop");
    const filters = page.getByRole("button", { name: "Filters & budget", exact: true });
    if (await filters.isVisible()) await filters.click();
    await page.getByLabel(/My maximum budget/).fill("75");
    await page.getByRole("button", { name: /Find.*options/i }).click();
    const results = page.getByRole("region", { name: "Budget results" });
    await expect(results).toBeVisible();
    await results.scrollIntoViewIfNeeded();
    await expect(results.locator("article").first()).toBeVisible();
    await page.screenshot({ path: `test-results/budget-results-${width}-viewport.png` });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `test-results/budget-results-${width}.png`, fullPage: true });
    async function checkLayout() {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const bounds = await results.locator("article").evaluateAll((cards) =>
        cards.map((card) => {
          const r = card.getBoundingClientRect();
          return { left: r.left, right: r.right, width: r.width };
        }),
      );
      for (const box of bounds) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(width);
      }
      const oversized = await results
        .locator("svg")
        .evaluateAll((icons) => icons.filter((icon) => icon.getBoundingClientRect().width > 32).length);
      expect(oversized).toBe(0);
    }
    await checkLayout();
    for (const article of await results.locator("article").all()) await article.scrollIntoViewIfNeeded();
    for (const name of ["Ready now", "Custom cakes", "All"]) {
      await results.getByRole("button", { name, exact: true }).click();
      await checkLayout();
    }
    const view = results.getByRole("link", { name: "View", exact: true }).first();
    await view.click();
    await expect(page).toHaveURL(/\/product\//);
    await expect(page.getByRole("button", { name: /Add to basket/ })).toBeVisible();
    await page.goBack();
    await expect(results).toBeVisible();
    await results.getByRole("button", { name: "Clear budget" }).click();
    await expect(results).not.toBeVisible();
    if (await filters.isVisible()) await filters.click();
    await page.getByLabel(/My maximum budget/).fill("1");
    await page.getByRole("button", { name: /Find.*options/i }).click();
    await expect(results.getByRole("heading", { name: "Closest alternatives" })).toBeVisible();
    await checkLayout();
  });
}

test("cake type controls the earliest bakery date", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-07T12:00:00Z") });
  await page.goto("/custom-cakes");
  await page.getByRole("button", { name: /Wedding Cake/ }).click();
  await expect(page.getByText("Minimum lead time: 3 weeks").first()).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  for (const name of ["Birthday", "6 inch", "Vanilla", "Buttercream", "Classic finish"]) {
    await page
      .getByRole("button", { name: new RegExp(name) })
      .first()
      .click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await page.getByLabel("Colour palette").fill("Ivory");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Collection or delivery date")).toHaveAttribute("min", "2026-10-28");
  await page.getByLabel("Collection or delivery date").fill("2026-10-20");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".builder-stage .form-error")).toContainText("Earliest date: 2026-10-28");
});

test("made-to-order pack selection and budget prices agree", async ({ page }) => {
  await page.goto("/shop?mode=MADE_TO_ORDER");
  await page.getByRole("link", { name: "Classic Butter Croissant", exact: true }).first().click();
  for (const [name, price] of [
    ["Pack of 3", "$15.00"],
    ["Pack of 6", "$27.00"],
    ["Pack of 12", "$50.00"],
  ]) {
    await page.getByRole("radio", { name: new RegExp(name) }).check();
    await expect(page.getByRole("button", { name: /Add to basket/ })).toContainText(price);
  }
  await page.goto("/shop?maxPrice=30&mode=MADE_TO_ORDER");
  const results = page.getByRole("region", { name: "Budget results" });
  await expect(results.getByText("Pack of 3", { exact: true })).toBeVisible();
  await expect(results.getByText("Pack of 6", { exact: true })).toBeVisible();
  await expect(results.getByText("Pack of 12", { exact: true })).toHaveCount(0);
  await results.getByRole("link", { name: "View", exact: true }).nth(1).click();
  await expect(page.getByRole("radio", { name: /Pack of 6/ })).toBeChecked();
});

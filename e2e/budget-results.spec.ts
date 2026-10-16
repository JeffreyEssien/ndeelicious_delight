import { expect, test } from "@playwright/test";

test.skip(process.env.NDEE_BROWSER_FIXTURES !== "true", "Requires the isolated fixture server.");

test.beforeEach(async ({ request }) => {
  const response = await request.post("http://127.0.0.1:4545/__fixtures/reset");
  expect(response.ok()).toBe(true);
});

for (const width of [320, 360, 375, 390, 430]) {
  test(`budget result journey at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : width === 430 ? 932 : 812 });
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
    await results.getByRole("button", { name: "Custom cakes", exact: true }).click();
    const renderedCount = await results.locator("article").count();
    await expect(results.getByRole("status")).toHaveText(`${renderedCount} options found`);
    await results.getByRole("link", { name: "Customize", exact: true }).first().click();
    await expect(page).toHaveURL(/cakeTypeId=/);
    await expect(page.locator(".choice-grid .selected")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.locator(".choice-grid .selected")).toHaveCount(1);
    await page.goBack();
    await expect(results).toBeVisible();
    await results.getByRole("button", { name: "All", exact: true }).click();
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

test("made-to-order pack selection and budget prices agree", async ({ page }) => {
  await page.goto("/shop");
  await page.getByRole("link", { name: "Classic Butter Croissant", exact: true }).first().click();
  for (const [name, price] of [
    ["Pack of 3", "$15.00"],
    ["Pack of 6", "$27.00"],
    ["Pack of 12", "$50.00"],
  ]) {
    await page.getByRole("radio", { name: new RegExp(name) }).check();
    await expect(page.getByRole("button", { name: /Add to basket/ })).toContainText(price);
  }
  await page.goto("/shop?maxPrice=30");
  const results = page.getByRole("region", { name: "Budget results" });
  await expect(results.getByText("Pack of 3", { exact: true })).toBeVisible();
  await expect(results.getByText("Pack of 6", { exact: true })).toBeVisible();
  await expect(results.getByText("Pack of 12", { exact: true })).toHaveCount(0);
  await results.getByRole("link", { name: "View", exact: true }).nth(1).click();
  await expect(page.getByRole("radio", { name: /Pack of 6/ })).toBeChecked();
});

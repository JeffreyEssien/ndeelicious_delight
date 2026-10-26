import { expect, test } from "@playwright/test";

// Read-only customer checks against the local fixture catalogue (see e2e/README.md).
const croissantPack = {
  productId: "00000002-1111-4111-8111-111111111111",
  variantId: "00000111-1111-4111-8111-111111111111",
  quantity: 2,
};
const chocolateCroissant = {
  productId: "00000003-1111-4111-8111-111111111111",
  variantId: "00000120-1111-4111-8111-111111111111",
  quantity: 3,
};

test.beforeEach(async ({ page }) => {
  test.skip(process.env.NDEE_BROWSER_FIXTURES !== "true", "Isolated local fixtures only.");
  await page.route("**/api/analytics/events", (route) => route.fulfill({ status: 204 }));
});

for (const width of [320, 360, 375, 390]) {
  test(`header menu stays on screen at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/shop");
    const menu = page.getByRole("button", { name: "Open navigation" });
    await expect(menu).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("desktop checkout shows the order summary and total", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(
    (lines) => localStorage.setItem("ndee-cart-v1", JSON.stringify(lines)),
    [croissantPack, chocolateCroissant],
  );
  await page.goto("/checkout");
  const summary = page.locator(".checkout-summary-content");
  await expect(summary.getByRole("heading", { name: "Order summary" })).toBeVisible();
  await expect(summary.getByText("Classic Butter Croissant")).toBeVisible();
  // 2 × $27 packs (zero-rated) + 3 × $5.50 with 14% HST on $16.50.
  await expect(summary.locator(".total-row dd")).toHaveText("$72.81");
});

test("a refreshed checkout does not flash an empty basket", async ({ page }) => {
  // The basket lives in localStorage, so the server render must not claim it is empty.
  for (const [path, emptyState] of [
    ["/checkout", "checkout-empty"],
    ["/cart", "cart-empty"],
  ])
    expect(await (await page.request.get(path)).text()).not.toContain(`empty-state ${emptyState}`);
  await page.addInitScript(
    (lines) => localStorage.setItem("ndee-cart-v1", JSON.stringify(lines)),
    [chocolateCroissant],
  );
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "Who is this order for?" })).toBeVisible();
  await expect(page.getByText("Your basket is empty")).toHaveCount(0);
});

test("homepage shopping-mode links filter the shop", async ({ page }) => {
  await page.goto("/shop");
  const allTreats = (await page.locator(".result-count").textContent())?.match(/\d+ treats/)?.[0] ?? "";
  expect(allTreats).not.toBe("2 treats");
  await page.goto("/shop?mode=READY_TO_BAKE");
  await expect(page.locator(".result-count")).toContainText("2 treats");
  await expect(page.locator(".result-count")).toContainText("Ready to bake");
  await page.getByRole("button", { name: "Show all" }).click();
  await expect(page.locator(".result-count")).toContainText(allTreats);
  await page.goto("/shop?category=ready-to-bake");
  await expect(page.locator(".result-count")).toContainText("2 treats");
});

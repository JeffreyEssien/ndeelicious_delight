import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page, context }) => {
  test.skip(process.env.NDEE_BROWSER_FIXTURES !== "true", "Isolated local fixtures only.");
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
  await page.route("**/api/analytics/events", (route) => route.fulfill({ status: 204 }));
  await page.request.post("/api/admin/mutate", { data: { action: "theme", theme: "berry" } });
});

test("mobile editor scrolls without overlays covering product controls", async ({ page }, testInfo) => {
  await page.goto("/admin/products");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toHaveCSS("opacity", "0");
  await page.mouse.click(2, 2);
  await page.keyboard.press("Tab");
  await skip.focus();
  await expect(skip).toHaveCSS("opacity", "1");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Add product", exact: true });
  await expect(editor.getByRole("button", { name: "Close product drawer" })).toBeFocused();
  await expect(skip).toHaveCSS("opacity", "0");
  const content = editor.locator(".product-editor-content");
  await content.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const save = editor.getByRole("button", { name: "Create product", exact: true });
  await expect(save).toBeInViewport();
  const bounds = await editor.boundingBox();
  expect(bounds?.height).toBeLessThanOrEqual(page.viewportSize()?.height ?? 0);
  await page.screenshot({ path: testInfo.outputPath("editor-mobile-scroll.png") });
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("arbitrary packs persist, preserve prices and work across all themes", async ({ page }, testInfo) => {
  test.setTimeout(120000);
  await page.goto("/admin/products");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  const fresh = page.getByRole("dialog", { name: "Add product", exact: true });
  await expect(fresh.getByText("No packs yet.", { exact: false })).toBeVisible();
  await fresh.getByRole("button", { name: "Cancel", exact: true }).click();
  const row = page.locator("tr").filter({ hasText: "Classic Butter Croissant" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit Classic Butter Croissant" });
  for (let i = 0; i < 3; i++) await editor.getByRole("button", { name: "Retire", exact: true }).first().click();
  await expect(editor.locator(".pack-editor-card")).toHaveCount(0);
  for (const [size, price] of [
    [3, 12],
    [5, 19],
    [8, 24],
    [15, 48],
  ]) {
    await editor.getByRole("button", { name: "Add pack", exact: true }).click();
    const card = editor.locator(".pack-editor-card").last();
    await card.getByLabel("Display name").fill(`Box of ${size}`);
    await card.getByLabel("Pieces per pack").fill(String(size));
    await card.getByLabel("Selling price (CAD)").fill(String(price));
    await card.getByLabel("Published (available to customers)", { exact: true }).check();
    if (size === 8 || size === 15) {
      await card.locator("summary").click();
      await card.getByLabel("Track stock for this pack").check();
      await card.getByLabel("Stock (available packs)").fill(size === 8 ? "4" : "1");
    }
    await card.getByRole("button", { name: "Done", exact: true }).click();
  }
  await editor.getByLabel("Price (CAD)", { exact: true }).fill("25");
  await editor.getByLabel("Sale price (CAD)", { exact: true }).fill("10");
  await editor.getByRole("button", { name: "Add common sizes", exact: true }).click();
  await editor.getByRole("button", { name: "Add common sizes", exact: true }).click();
  await expect(editor.locator(".pack-editor-card")).toHaveCount(6);
  await editor.locator(".pack-editor-card").last().getByRole("button", { name: "Retire", exact: true }).click();
  await editor.locator(".pack-editor-card").last().getByRole("button", { name: "Retire", exact: true }).click();
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await page.reload();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(editor.locator(".pack-editor-card")).toHaveCount(4);
  const five = editor.locator(".pack-editor-card").filter({ hasText: "Box of 5" });
  await five.getByRole("button", { name: "Disable", exact: true }).click();
  await editor.getByRole("button", { name: "Move Box of 8 earlier" }).click();
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await page.reload();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(editor.locator(".pack-editor-card").nth(1)).toContainText("Box of 8");
  await expect(five).toContainText("Unavailable");
  await five.getByRole("button", { name: "Enable", exact: true }).click();
  await five.getByRole("button", { name: "Edit", exact: true }).click();
  await five.getByLabel("Display name").fill("Sharing box of 5");
  await five.getByRole("button", { name: "Done", exact: true }).click();
  await editor.getByLabel("Price (CAD)", { exact: true }).fill("30");
  await editor.getByLabel("Sale price (CAD)", { exact: true }).fill("15");
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await page.reload();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(editor.locator(".pack-editor-card").filter({ hasText: "Box of 8" })).toContainText("CAD 24.00");
  await expect(editor.locator(".pack-editor-card").filter({ hasText: "Sharing box" })).toContainText("Published");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("owner-packs.png") });
  const ownerAxe = await new AxeBuilder({ page })
    .include(".product-editor-content")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(ownerAxe.violations).toEqual([]);
  await page.keyboard.press("Escape");
  for (const theme of ["berry", "purple", "sunrise"]) {
    await page.request.post("/api/admin/mutate", { data: { action: "theme", theme } });
    await page.goto("/admin/products");
    await row.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(editor.locator(".pack-editor-card")).toHaveCount(4);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const ownerThemeAxe = await new AxeBuilder({ page })
      .include(".product-editor-content")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(ownerThemeAxe.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await editor.locator(".pack-editor-card").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`${theme}-owner-packs.png`) });
    await page.keyboard.press("Escape");
    await page.goto("/shop");
    const card = page
      .locator(".catalogue-results .product-card:visible")
      .filter({ hasText: "Classic Butter Croissant" });
    await expect(card.getByText("Made to Order", { exact: true })).toBeVisible();
    await expect(card.getByRole("link", { name: "Select options", exact: true })).toBeVisible();
    await card.getByRole("link", { name: "Select options", exact: true }).click();
    await expect(page.locator(".add-main")).toBeDisabled();
    const eight = page.getByRole("radio", { name: /Box of 8/ });
    await eight.focus();
    await page.keyboard.press("Space");
    await expect(eight).toBeChecked();
    await page.getByRole("button", { name: "Increase quantity", exact: true }).click();
    await page.getByRole("button", { name: "Increase quantity", exact: true }).click();
    await expect(page.locator(".pack-selection-summary")).toContainText("3 packs · 24 pieces");
    await page.getByRole("radio", { name: /Box of 15/ }).check();
    await expect(page.locator(".pack-selection-summary")).toContainText("1 pack · 15 pieces");
    await eight.check();
    await page.getByRole("button", { name: "Increase quantity", exact: true }).click();
    await expect(page.locator(".pack-selection-summary")).toContainText("2 packs · 16 pieces");
    await expect(page.locator(".add-main")).toContainText("48.00");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const label of await page.locator(".pack-options > label").all())
      expect((await label.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    const axe = await new AxeBuilder({ page })
      .include(".purchase-box")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`${theme}-selected-pack.png`), fullPage: true });
    await page.locator(".add-main").click();
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("ndee-cart-v1") ?? "[]")[0]?.quantity))
      .toBe(2);
    await page.goto("/cart");
    await expect(page.locator(".cart-page-line")).toContainText("2 packs / 16 pieces");
    await expect(page.locator(".order-summary")).toContainText("48.00");
    const quoteResponse = await page.request.post("/api/checkout/quote", {
      data: {
        customer: { name: "Pack Buyer", email: "pack@example.invalid", phone: "9025550100" },
        delivery: { fulfilment: "pickup" },
        cart: JSON.parse(await page.evaluate(() => localStorage.getItem("ndee-cart-v1") ?? "[]")),
      },
    });
    expect(quoteResponse.status()).toBe(200);
    const { quote } = await quoteResponse.json();
    expect(quote.subtotal).toBe(4800);
    expect(quote.lines[0].totalPieces).toBe(16);
    expect(quote.lines[0].unitPrice).toBe(2400);
    expect(quote.taxTotal).toBe(0);
    await page.getByRole("button", { name: "Clear basket", exact: true }).click();
  }
});

test("one pack still requires selection and larger lists use an accessible selector", async ({ page }) => {
  await page.goto("/admin/products");
  await page
    .locator("tr")
    .filter({ hasText: "Classic Butter Croissant" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "Edit Classic Butter Croissant" });
  await editor.locator(".pack-editor-card").last().getByRole("button", { name: "Retire", exact: true }).click();
  await editor.locator(".pack-editor-card").last().getByRole("button", { name: "Retire", exact: true }).click();
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await page.goto("/shop");
  await expect(
    page
      .locator(".product-card")
      .filter({ hasText: "Classic Butter Croissant" })
      .getByRole("link", { name: "Select options", exact: true }),
  ).toBeVisible();
  await page.goto("/product/classic-butter-croissant");
  await expect(page.getByRole("radio")).toHaveCount(1);
  await expect(page.locator(".add-main")).toBeDisabled();
  await page.getByRole("radio").check();
  await expect(page.locator(".add-main")).toBeEnabled();
  await page.goto("/admin/products");
  await page
    .locator("tr")
    .filter({ hasText: "Classic Butter Croissant" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  for (const size of [2, 5, 7, 8, 15, 18]) {
    await editor.getByRole("button", { name: "Add pack", exact: true }).click();
    const card = editor.locator(".pack-editor-card").last();
    await card.getByLabel("Display name").fill(`Party pack ${size}`);
    await card.getByLabel("Pieces per pack").fill(String(size));
    await card.getByLabel("Selling price (CAD)").fill(String(size * 3));
    await card.getByLabel("Published (available to customers)").check();
    await card.getByRole("button", { name: "Done", exact: true }).click();
  }
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await page.goto("/product/classic-butter-croissant");
  const select = page.getByRole("combobox", { name: "Pack options", exact: true });
  const option = await select.locator("option").filter({ hasText: "Party pack 18" }).getAttribute("value");
  await select.selectOption(option ?? "");
  await expect(page.locator(".pack-selection-summary")).toContainText("18 pieces");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("empty drafts, publication errors, duplication, loading and sold-out prices", async ({ page }) => {
  await page.goto("/admin/products");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  const add = page.getByRole("dialog", { name: "Add product", exact: true });
  await add.getByLabel("Product name", { exact: true }).fill("Dynamic made-to-order draft");
  await add.getByLabel("Short description", { exact: true }).fill("Prepared packs for your celebration.");
  await add.getByLabel("Full description", { exact: true }).fill("Choose any of our owner-configured pack sizes.");
  await add.getByRole("button", { name: "Create product", exact: true }).click();
  await expect(add).not.toBeVisible();
  await page.reload();
  await page
    .locator("tr")
    .filter({ hasText: "Dynamic made-to-order draft" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "Edit Dynamic made-to-order draft", exact: true });
  await expect(editor.getByText("No packs yet.", { exact: false })).toBeVisible();
  await editor.getByLabel("Storefront visibility").selectOption("ACTIVE");
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor.getByRole("status").filter({ hasText: "Saved as a hidden draft" })).toContainText(
    "Publish at least one pack or size",
  );
  await editor.getByLabel("Tax classification").selectOption("STANDARD_TAXABLE");
  await editor.getByRole("button", { name: "Add pack", exact: true }).click();
  const original = editor.locator(".pack-editor-card").first();
  await original.getByLabel("Display name").fill("Box of 8");
  await original.getByLabel("Pieces per pack").fill("8");
  await original.getByLabel("Selling price (CAD)").fill("24");
  await original.getByLabel("Published (available to customers)").check();
  await original.locator("summary").click();
  await original.getByLabel("Track stock for this pack").check();
  await original.getByLabel("Stock (available packs)").fill("0");
  await original.getByRole("button", { name: "Done", exact: true }).click();
  await original.getByRole("button", { name: "Duplicate", exact: true }).click();
  const copied = editor.locator(".pack-editor-card").last();
  await copied.getByLabel("Display name").fill("Party box of 15");
  await copied.getByLabel("Pieces per pack").fill("15");
  await copied.getByLabel("Selling price (CAD)").fill("48");
  await copied.getByLabel("Published (available to customers)").check();
  await copied.getByRole("button", { name: "Done", exact: true }).click();
  let releaseResponse!: () => void;
  const blocked = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  const fail = async (route: import("@playwright/test").Route) => {
    await blocked;
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ error: "Stock changed. Reload before saving." }),
    });
  };
  await page.route("**/api/admin/products/*", fail);
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor.locator("form")).toHaveAttribute("aria-busy", "true");
  await expect(editor.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
  releaseResponse();
  await expect(editor.getByRole("alert")).toContainText("Stock changed");
  await page.unroute("**/api/admin/products/*", fail);
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await page.reload();
  await page
    .locator("tr")
    .filter({ hasText: "Dynamic made-to-order draft" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await expect(editor.locator(".pack-editor-card")).toHaveCount(2);
  await expect(editor.locator(".pack-editor-card").last()).toContainText("Party box of 15");
  await page.keyboard.press("Escape");
  await page.goto("/shop");
  const card = page
    .locator(".catalogue-results .product-card:visible")
    .filter({ hasText: "Dynamic made-to-order draft" });
  await expect(card).toContainText("From $24.00");
  await expect(card).toContainText("Sold out");
  await card.getByRole("link", { name: "Select options", exact: true }).click();
  await expect(page.getByRole("radio").first()).toBeDisabled();
  await expect(page.getByRole("radio").last()).toBeDisabled();
  await expect(page.locator(".add-main")).toBeDisabled();
});

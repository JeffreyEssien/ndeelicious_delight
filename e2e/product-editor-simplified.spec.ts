import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

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
});

test("prices live on packs, options only on cakes, and every product starts at a 24-hour lead time", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/admin/products");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Add product", exact: true });

  await expect(editor.getByRole("heading", { name: "Visibility", exact: true })).toBeVisible();
  await expect(editor.getByLabel("Price (CAD)", { exact: true })).toHaveCount(0);
  await expect(editor.getByLabel("Sale price (CAD)", { exact: true })).toHaveCount(0);
  await expect(editor.getByRole("heading", { name: "Options & flavours" })).toHaveCount(0);
  await expect(editor.getByLabel("Preparation time (hours)")).toHaveValue("0");
  await expect(editor.getByLabel("Preparation time (minutes)")).toHaveValue("0");

  await editor.getByRole("combobox", { name: "Category", exact: true }).selectOption("CUSTOM_CAKES");
  await expect(editor.getByRole("heading", { name: "Flavours & fillings" })).toBeVisible();
  await editor.getByRole("combobox", { name: "Category", exact: true }).selectOption("PASTRIES");
  await expect(editor.getByRole("heading", { name: "Flavours & fillings" })).toHaveCount(0);

  await editor.getByLabel("Product name").fill("Fixture Range Cupcakes");
  await editor.getByLabel("Short description").fill("Vanilla cupcakes.");
  await editor.getByLabel("Full description").fill("Soft vanilla cupcakes with buttercream.");
  await editor.getByLabel("Storefront visibility").selectOption("ACTIVE");
  for (const [size, price] of [
    [6, "18"],
    [12, "32.50"],
  ] as const) {
    await editor.getByRole("button", { name: "Add pack", exact: true }).click();
    const card = editor.locator(".pack-editor-card").last();
    await card.getByLabel("Display name").fill(`Box of ${size}`);
    await card.getByLabel("Pieces per pack").fill(String(size));
    await card.getByLabel("Selling price (CAD)").fill(price);
    await card.getByLabel("Published (available to customers)").check();
    await card.getByRole("button", { name: "Done", exact: true }).click();
  }
  // Preparation time is separate from the 24-hour minimum lead time, so it can be minutes.
  await editor.getByLabel("Preparation time (hours)").fill("0");
  await editor.getByLabel("Preparation time (minutes)").fill("45");
  await editor.getByRole("button", { name: "Create product", exact: true }).click();
  await expect(editor).toBeHidden();

  const row = page.locator("tr").filter({ hasText: "Fixture Range Cupcakes" });
  await expect(row).toContainText(/18\.00\s*–\s*.*32\.50/);
});

test("a category picked on a phone sticks when input and change arrive separately", async ({ page }) => {
  await page.goto("/admin/products");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Add product", exact: true });
  const category = editor.getByRole("combobox", { name: "Category", exact: true });
  // Phones fire input and change as separate tasks, so React renders between them.
  await category.evaluate(async (select: HTMLSelectElement) => {
    select.value = "CUSTOM_CAKES";
    select.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(category).toHaveValue("CUSTOM_CAKES");
  await expect(editor.getByRole("heading", { name: "Flavours & fillings" })).toBeVisible();
});

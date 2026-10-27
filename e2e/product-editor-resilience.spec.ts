import { createHmac } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";

// Everything an owner can get wrong while adding or editing a product must end with her work saved or
// kept, never lost: a half-finished product saves as a hidden draft, a closed drawer or refreshed page
// offers her changes back, and connection or login problems say what to do.

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

async function addProduct(page: Page) {
  await page.goto("/admin/products");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  return page.getByRole("dialog", { name: "Add product", exact: true });
}

async function storedProduct(page: Page, name: string) {
  const products = await (
    await page.request.get(`http://127.0.0.1:4545/rest/v1/products?name=eq.${encodeURIComponent(name)}`)
  ).json();
  return (Array.isArray(products) ? products : [products]).find((product: { name: string }) => product.name === name);
}

test("a product with only a name is saved as a hidden draft with a to-do list", async ({ page }) => {
  const editor = await addProduct(page);
  await editor.getByLabel("Product name").fill("Puff Puff");
  await editor.getByLabel("Storefront visibility").selectOption("ACTIVE");
  await editor.getByRole("button", { name: "Create product", exact: true }).click();

  const notice = editor.getByRole("status").filter({ hasText: "Saved as a hidden draft" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Add a short description.");
  await expect(notice).toContainText("Add a full description.");
  await expect(editor.getByLabel("Storefront visibility")).toHaveValue("DRAFT");
  await expect(editor.getByRole("heading", { name: "Edit product" })).toBeVisible();
  expect((await storedProduct(page, "Puff Puff"))?.status).toBe("DRAFT");

  // Finishing it later publishes it.
  await editor.getByLabel("Short description").fill("Soft, sweet dough balls.");
  await editor.getByLabel("Full description").fill("Deep-fried Nigerian dough, dusted with sugar.");
  await editor.getByRole("button", { name: "Add pack", exact: true }).click();
  const card = editor.locator(".pack-editor-card").last();
  await card.getByLabel("Display name").fill("Bowl of 10");
  await card.getByLabel("Pieces per pack").fill("10");
  await card.getByLabel("Selling price (CAD)").fill("8");
  await card.getByLabel("Published (available to customers)").check();
  await editor.getByLabel("Storefront visibility").selectOption("ACTIVE");
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor).toBeHidden();
  expect((await storedProduct(page, "Puff Puff"))?.status).toBe("ACTIVE");
});

test("nonsense numbers and incomplete packs never block a save", async ({ page }) => {
  const editor = await addProduct(page);
  await editor.getByLabel("Product name").fill("Chin Chin");
  await editor.getByLabel("Short description").fill("Crunchy fried snack.");
  await editor.getByLabel("Full description").fill("Crunchy, lightly sweet fried dough.");
  await editor.getByLabel("Storefront visibility").selectOption("ACTIVE");
  await editor.getByLabel("Preparation time (hours)").fill("-5");
  await editor.getByLabel("Low-stock alert").fill("-3");
  await editor.getByLabel("Allergens (comma separated)").fill("Eggs, eggs,, Dairy ,");
  // A pack with a negative price and no size, and two packs with the same size.
  await editor.getByRole("button", { name: "Add pack", exact: true }).click();
  let card = editor.locator(".pack-editor-card").last();
  await card.getByLabel("Display name").fill("Broken pack");
  await card.getByLabel("Selling price (CAD)").fill("-5");
  await card.getByLabel("Published (available to customers)").check();
  await card.getByRole("button", { name: "Done", exact: true }).click();
  for (const name of ["Small bag", "Small bag again"]) {
    await editor.getByRole("button", { name: "Add pack", exact: true }).click();
    card = editor.locator(".pack-editor-card").last();
    await card.getByLabel("Display name").fill(name);
    await card.getByLabel("Pieces per pack").fill("20");
    await card.getByLabel("Selling price (CAD)").fill("6");
    await card.getByLabel("Published (available to customers)").check();
    await card.getByRole("button", { name: "Done", exact: true }).click();
  }
  await editor.getByRole("button", { name: "Create product", exact: true }).click();

  const notice = editor.getByRole("status").filter({ hasText: "Saved as a hidden draft" });
  await expect(notice).toContainText("Preparation time cannot be negative.");
  const stored = await storedProduct(page, "Chin Chin");
  expect(stored.status).toBe("DRAFT");
  expect(stored.preparation_hours).toBe(0);
  expect(stored.low_stock_threshold).toBe(0);
  expect(stored.allergens).toEqual(["Eggs", "Dairy"]);
  // The incomplete pack and the repeated size were switched off; the good pack stayed published.
  await expect(editor.locator(".pack-editor-card").filter({ hasText: "Small bag again" })).toContainText("Unavailable");
  const packs = editor.locator(".pack-editor-card");
  await expect(packs.nth(0)).toContainText("Unavailable");
  await expect(packs.nth(1)).toContainText("Published");
  await expect(packs.nth(2)).toContainText("Unavailable");
});

test("a name already in use, or with no letters, still saves with a working link", async ({ page }) => {
  let editor = await addProduct(page);
  await editor.getByLabel("Product name").fill("Classic Butter Croissant");
  await editor.getByRole("button", { name: "Create product", exact: true }).click();
  await expect(editor).toBeHidden();
  const copies = await (
    await page.request.get("http://127.0.0.1:4545/rest/v1/products?slug=eq.classic-butter-croissant-2")
  ).json();
  expect(copies).toHaveLength(1);

  editor = await addProduct(page);
  await editor.getByLabel("Product name").fill("🎂🎂");
  await editor.getByRole("button", { name: "Create product", exact: true }).click();
  await expect(editor).toBeHidden();
  expect((await storedProduct(page, "🎂🎂"))?.slug).toMatch(/^product-[0-9a-f]{8}$/);
});

test("closing the drawer by accident, or refreshing, offers the work back", async ({ page }) => {
  const editor = await addProduct(page);
  await editor.getByLabel("Product name").fill("Meat Pie");
  await editor.getByLabel("Short description").fill("Flaky pastry, minced beef filling.");
  await editor.getByLabel("Allergens (comma separated)").fill("Gluten");
  await page.waitForTimeout(500);

  // Escape asks first; staying keeps everything in place.
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.keyboard.press("Escape");
  await expect(editor.getByLabel("Product name")).toHaveValue("Meat Pie");

  // Closing anyway, then a full page refresh: nothing is lost.
  page.once("dialog", (dialog) => dialog.accept());
  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  await page.reload();
  const reopened = await addProduct(page);
  await expect(reopened.getByText("You have unsaved changes")).toBeVisible();
  await reopened.getByRole("button", { name: "Restore changes", exact: true }).click();
  await expect(reopened.getByLabel("Product name")).toHaveValue("Meat Pie");
  await expect(reopened.getByLabel("Short description")).toHaveValue("Flaky pastry, minced beef filling.");
  await expect(reopened.getByLabel("Allergens (comma separated)")).toHaveValue("Gluten");

  // Once saved, the backup is gone.
  await reopened.getByRole("button", { name: "Create product", exact: true }).click();
  await expect(reopened).toBeHidden();
  const again = await addProduct(page);
  await expect(again.getByText("You have unsaved changes")).toHaveCount(0);
});

test("a dropped connection or expired login keeps the editor and explains what to do", async ({ page }) => {
  const editor = await addProduct(page);
  await editor.getByLabel("Product name").fill("Zobo Drink");

  await page.route("**/api/admin/products", (route) => route.abort("internetdisconnected"));
  await editor.getByRole("button", { name: "Create product", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("Could not reach the website");
  await expect(editor.getByLabel("Product name")).toHaveValue("Zobo Drink");
  await page.unroute("**/api/admin/products");

  await page.route("**/api/admin/products", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: '{"error":"Unauthorized."}' }),
  );
  await editor.getByRole("button", { name: "Create product", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("You were signed out");
  await page.unroute("**/api/admin/products");

  await editor.getByRole("button", { name: "Create product", exact: true }).click();
  await expect(editor).toBeHidden();
  expect(await storedProduct(page, "Zobo Drink")).toBeTruthy();
});

test("a live product is never hidden without asking", async ({ page }) => {
  await page.goto("/admin/products");
  const row = page.locator("tr").filter({ hasText: "Classic Butter Croissant" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit Classic Butter Croissant" });
  await editor.getByLabel("Full description").fill("");
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();

  const alert = editor.getByRole("alert");
  await expect(alert).toContainText("Not saved yet");
  await expect(alert).toContainText("Add a full description.");
  expect((await storedProduct(page, "Classic Butter Croissant"))?.status).toBe("ACTIVE");

  // Her choice: drafts may have blank descriptions, so this saves cleanly and closes.
  await alert.getByRole("button", { name: "Save as hidden draft", exact: true }).click();
  await expect(editor).toBeHidden();
  expect((await storedProduct(page, "Classic Butter Croissant"))?.status).toBe("DRAFT");
});

test("a cake size picked from the library without a guest count saves as a draft", async ({ page }) => {
  const editor = await addProduct(page);
  await editor.getByRole("combobox", { name: "Category", exact: true }).selectOption("CUSTOM_CAKES");
  await editor.getByLabel("Product name").fill("Red Velvet Cake");
  await editor.getByLabel("Add a size from your Flavours & sizes library").selectOption("6 inch");
  const card = editor.locator(".pack-editor-card").last();
  await card.getByLabel("Published (available to customers)").check();
  await editor.getByLabel("Storefront visibility").selectOption("ACTIVE");
  await editor.getByRole("button", { name: "Create product", exact: true }).click();

  await expect(editor.getByRole("status").filter({ hasText: "Saved as a hidden draft" })).toBeVisible();
  await expect(card).toContainText("Unavailable");
  expect((await storedProduct(page, "Red Velvet Cake"))?.status).toBe("DRAFT");
});

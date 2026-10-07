import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

test("owner configuration immediately drives cake rules and pack visibility", async ({ page, context }) => {
  test.skip(process.env.NDEE_BROWSER_FIXTURES !== "true", "Requires the local fixture server, never a live database.");
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100");
  expect(["localhost", "127.0.0.1"]).toContain(origin.hostname);
  const secret = "isolated-ndee-browser-secret-32-characters";
  const payload = `fixture-token.${Math.floor(Date.now() / 1000) + 3600}`;
  const signature = createHmac("sha256", secret).update(`cookie:${payload}`).digest("hex");
  await context.addCookies([
    { name: "ndee_admin_session", value: `${payload}.${signature}`, url: origin.origin, httpOnly: true },
  ]);
  await page.route("**/api/analytics/events", (route) => route.fulfill({ status: 204 }));
  await page.request.post("http://127.0.0.1:4545/__fixtures/reset-cake-types");
  await page.goto("/admin/custom-cakes");
  await page.getByRole("tab", { name: /Configuration/ }).click();
  const editor = page.locator(".cake-types-editor");
  for (const [name, slug, value] of [
    ["Wedding Cake", "wedding-cake", "3"],
    ["Birthday Cake", "birthday-cake", "1"],
  ]) {
    await editor.getByRole("button", { name: "Add cake type" }).click();
    const card = editor.locator("article").last();
    await card.getByLabel("Name", { exact: true }).fill(name);
    await card.getByLabel("URL slug").fill(slug);
    await card.getByLabel("Lead time", { exact: true }).fill(value);
    await card.getByLabel("Lead-time unit").selectOption("weeks");
    await card.getByLabel("Base price (CAD)").fill("2");
    await card.getByLabel("Tax classification").selectOption("FULL_CAKE");
    for (const checkbox of await card.locator("fieldset input[type=checkbox]").all()) await checkbox.check();
    await card.getByLabel("Active", { exact: true }).check();
  }
  await editor.getByRole("button", { name: "Save cake types" }).click();
  await expect(editor.getByRole("status")).toHaveText("Saved");
  await page.goto("/custom-cakes");
  await expect(page.getByRole("button", { name: /Wedding Cake.*Minimum lead time: 3 weeks/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Birthday Cake.*Minimum lead time: 1 week/ })).toBeVisible();
  await page.goto("/admin/custom-cakes");
  await page.getByRole("tab", { name: /Configuration/ }).click();
  await editor.locator("article").first().getByLabel("Lead time", { exact: true }).fill("4");
  await editor.getByRole("button", { name: "Save cake types" }).click();
  await expect(editor.getByRole("status")).toHaveText("Saved");
  await page.goto("/custom-cakes");
  await expect(page.getByRole("button", { name: /Wedding Cake.*Minimum lead time: 4 weeks/ })).toBeVisible();
  await page.goto("/admin/products");
  await page
    .locator("tr")
    .filter({ hasText: "Classic Butter Croissant" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  const drawer = page.getByRole("dialog", { name: "Edit Classic Butter Croissant" });
  await expect(drawer.getByLabel("Shopping mode")).toHaveValue("MADE_TO_ORDER");
  await drawer
    .locator(".variant-editor")
    .filter({ has: page.locator('input[value="Pack of 12"]') })
    .getByLabel("Active", { exact: true })
    .uncheck();
  await drawer.getByRole("button", { name: /Save/ }).last().click();
  await expect(drawer).not.toBeVisible();
  await page.goto("/product/classic-butter-croissant");
  await expect(page.getByRole("radio", { name: /Pack of 12/ })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /Pack of 6/ })).toBeVisible();
});

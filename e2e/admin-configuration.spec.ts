import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

test("owner configuration immediately drives cake rules and pack visibility", async ({ page, context }, testInfo) => {
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
  await page.request.post("http://127.0.0.1:4545/__fixtures/reset");
  await page.request.post("http://127.0.0.1:4545/__fixtures/reset-cake-types");
  await page.goto("/admin/custom-cakes");
  await page.getByRole("tab", { name: /My cakes & options/ }).click();
  test.setTimeout(60000);
  await page.getByText("Edit shared sizes, flavours and extras", { exact: true }).click();
  await page.getByRole("button", { name: "Add option", exact: true }).click();
  const options = page.locator(".cake-option-list article");
  await options.last().getByLabel("Option name").fill("Fixture special occasion");
  const secondName = await options.nth(1).getByLabel("Option name").inputValue();
  await options.first().getByRole("button", { name: "Move down", exact: true }).click();
  await expect(options.first().getByLabel("Option name")).toHaveValue(secondName);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("tab", { name: "Customer requests", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My cakes", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save options", exact: true }).click();
  await expect(page.getByText("All options are saved.", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: /My cakes & options/ }).click();
  await page.getByText("Edit shared sizes, flavours and extras", { exact: true }).click();
  await expect(options.first().getByLabel("Option name")).toHaveValue(secondName);
  const editor = page.locator(".cake-types-editor");
  for (const [name, slug, value] of [
    ["Wedding Cake", "wedding-cake", "3"],
    ["Birthday Cake", "birthday-cake", "1"],
  ]) {
    await editor.getByRole("button", { name: "Quick add cake" }).click();
    const card = editor.locator("article").last();
    await card.getByLabel("Name", { exact: true }).fill(name);
    await page.route("**/api/admin/cakes/photo", (route) =>
      route.fulfill({ json: { url: "/brand-logo.jpg" }, status: 201 }),
    );
    await card
      .getByLabel("Photo", { exact: true })
      .setInputFiles({ name: "cake.png", mimeType: "image/png", buffer: Buffer.from("fixture photo") });
    await expect(card.getByText("Photo selected. Save your cake to apply it.")).toBeVisible();
    await card.getByText("Advanced settings", { exact: true }).click();
    await card.getByLabel("URL slug").fill(slug);
    await card.getByLabel("Preparation time", { exact: true }).fill(value);
    await card.getByLabel("Time unit").selectOption("weeks");
    await card.getByLabel("Starting price (CAD)").fill("2");
    await card.getByText(/Tax settings/).click();
    await card.getByLabel("Tax classification").selectOption("FULL_CAKE");
    await card.getByText("Customer choices · sizes, flavours and extras", { exact: true }).click();
    for (const checkbox of await card.locator("fieldset input[type=checkbox]").all()) await checkbox.check();
    await card.getByLabel("Published (available to customers)", { exact: true }).check();
  }
  await editor.getByRole("button", { name: "Save cake types" }).click();
  await expect(editor.getByRole("status")).toHaveText("Saved");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("cake-management.png"), fullPage: true });
  await page.goto("/custom-cakes");
  await expect(page.getByRole("button", { name: /Wedding Cake.*Minimum lead time: 3 weeks/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Birthday Cake.*Minimum lead time: 1 week/ })).toBeVisible();
  await page.goto("/admin/custom-cakes");
  await page.getByRole("tab", { name: /My cakes & options/ }).click();
  await editor
    .locator(".cake-type-card")
    .first()
    .evaluate((element) => {
      (element as HTMLDetailsElement).open = true;
    });
  await editor.locator("article").first().getByLabel("Preparation time", { exact: true }).fill("4");
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
    .locator(".pack-editor-card")
    .filter({ hasText: "Pack of 12" })
    .getByRole("button", { name: "Disable", exact: true })
    .click();
  await drawer.getByRole("button", { name: /Save/ }).last().click();
  await expect(drawer).not.toBeVisible();
  await page.goto("/product/classic-butter-croissant");
  await expect(page.getByRole("radio", { name: /Pack of 12/ })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /Pack of 6/ })).toBeVisible();
});

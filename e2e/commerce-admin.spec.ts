import fs from "node:fs/promises";
import { createHmac } from "node:crypto";
import { unzipSync } from "fflate";
import { expect, test } from "@playwright/test";
test.skip(process.env.NDEE_BROWSER_FIXTURES !== "true", "Requires the local isolated fixture server.");
test.beforeEach(async ({ context, page }) => {
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100");
  expect(["localhost", "127.0.0.1"]).toContain(origin.hostname);
  const payload = `fixture-token.${Math.floor(Date.now() / 1000) + 3600}`;
  const signature = createHmac("sha256", "isolated-ndee-browser-secret-32-characters")
    .update(`cookie:${payload}`)
    .digest("hex");
  await context.addCookies([
    { name: "ndee_admin_session", value: `${payload}.${signature}`, url: origin.origin, httpOnly: true },
  ]);
  await page.route("**/api/analytics/events", (route) => route.fulfill({ status: 204 }));
});
test("owner delivery configuration persists and rejects duplicate postal prefixes", async ({ page }) => {
  await page.request.post("http://127.0.0.1:4545/__fixtures/reset-delivery-areas");
  await page.goto("/admin/delivery");
  const workspace = page.locator(".delivery-workspace");
  await workspace.getByRole("button", { name: "Add delivery area" }).click();
  const card = workspace.locator(".zone-card").last();
  await card.getByLabel("Area name").fill("Fixture Halifax");
  await card.getByLabel("Postal prefixes").fill("B3H");
  await card.getByLabel("Delivery fee").fill("10");
  await card.getByLabel("Minimum order").fill("20");
  await card.getByLabel("Free delivery from").fill("50");
  await card.getByLabel("Delivery estimate").fill("Scheduled delivery");
  await card.getByRole("checkbox", { name: "Off", exact: true }).check();
  const savedResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/admin/mutate") && response.request().method() === "POST",
  );
  await workspace.getByRole("button", { name: "Save delivery areas" }).click();
  expect((await savedResponse).status()).toBe(200);
  await expect(workspace.locator(".admin-save-bar [role=status]")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByLabel("Postal prefixes").last()).toHaveValue("B3H");
  await expect(page.getByLabel("Free delivery from").last()).toHaveValue("50");
  await workspace.getByRole("button", { name: "Add delivery area" }).click();
  const duplicate = workspace.locator(".zone-card").last();
  await duplicate.getByLabel("Area name").fill("Duplicate fixture area");
  await duplicate.getByLabel("Postal prefixes").fill("B3H");
  await duplicate.getByRole("checkbox", { name: "Off", exact: true }).check();
  await workspace.getByRole("button", { name: "Save delivery areas" }).click();
  await expect(workspace.locator(".admin-save-bar [role=status]")).toContainText("Error");
  const persisted = await (await page.request.get("http://127.0.0.1:4545/rest/v1/delivery_zones")).json();
  const liveArea = persisted[0];
  const areaInput = {
    id: liveArea.id,
    name: liveArea.name,
    fee: liveArea.fee,
    minimumOrder: liveArea.minimum_order,
    estimate: liveArea.estimated_time,
    active: true,
    postalCodePrefixes: liveArea.postal_code_prefixes,
    freeDeliveryThreshold: liveArea.free_delivery_threshold,
    customerNote: "",
    sameDayEligible: false,
    sortOrder: 0,
  };
  const apiRejected = await page.request.post("/api/admin/mutate", {
    data: {
      action: "delivery-zones",
      zones: [areaInput, { ...areaInput, id: "22222222-2222-4222-8222-222222222222" }],
    },
  });
  expect(apiRejected.status()).toBe(400);
  await page.reload();
  await expect(workspace.locator(".zone-card")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("/admin/settings");
  await page.getByLabel("Offer delivery at checkout").check();
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(page.locator(".business-settings-form [role=status]")).toHaveText("Business settings saved");
  await page.goto("/delivery-information");
  await expect(page.getByText("Fixture Halifax", { exact: true })).toBeVisible();
  await expect(page.getByText(/Free delivery from.*50/)).toBeVisible();
  const customer = { name: "Fixture Buyer", email: "buyer@example.invalid", phone: "9025550100" };
  const delivery = {
    fulfilment: "delivery",
    street: "Fixture address",
    city: "Halifax",
    province: "NS",
    country: "CA",
    postalCode: "b3h2y5",
  };
  for (const [variantId, quantity, total, fee, tax] of [
    ["00000110-1111-4111-8111-111111111111", 2, 4560, 1000, 560],
    ["00000111-1111-4111-8111-111111111111", 1, 3840, 1000, 140],
    ["00000110-1111-4111-8111-111111111111", 4, 6840, 0, 840],
  ] as const) {
    const quoteResponse = await page.request.post("/api/checkout/quote", {
      data: { customer, delivery, cart: [{ productId: "00000002-1111-4111-8111-111111111111", variantId, quantity }] },
    });
    expect(quoteResponse.status()).toBe(200);
    const { quote } = await quoteResponse.json();
    expect(quote.grandTotal).toBe(total);
    expect(quote.deliveryFee).toBe(fee);
    expect(quote.taxTotal).toBe(tax);
    expect(quote.fulfilment.postalCode).toBe("B3H 2Y5");
    expect(Date.parse(quote.fulfilment.earliestAt)).toBeGreaterThanOrEqual(Date.now() + 48 * 3600000 - 10000);
  }
  await page.goto("/product/classic-butter-croissant");
  await page.getByRole("radio", { name: /Pack of 3/ }).check();
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await page.getByRole("button", { name: /Add to basket/ }).click();
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("ndee-cart-v1") ?? "[]")[0]?.quantity))
    .toBe(2);
  await page.goto("/checkout");
  await page.getByLabel("Full name").fill("Fixture Buyer");
  await page.getByLabel("Email address").fill("buyer@example.invalid");
  await page.getByLabel("Phone number").fill("9025550100");
  await page.getByRole("button", { name: "Continue to fulfilment" }).click();
  await page.getByLabel("Postal code", { exact: true }).fill("b3h2y5");
  await page.getByLabel("Street address", { exact: true }).fill("Fixture address");
  await page.getByLabel("City", { exact: true }).fill("Halifax");
  await expect(page.getByText(/Earliest available:/)).toBeVisible();
  await page.locator("details.checkout-summary").evaluate((element) => element.setAttribute("open", ""));
  await expect(page.locator(".total-row dd")).toHaveText("$45.60");
  await expect(page.getByRole("combobox", { name: /Province/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/checkout-postal-${test.info().project.name}.png`, fullPage: true });
});
test("marketing preview exports actual PNG and ZIP and reports image failures", async ({ page }) => {
  await page.goto("/admin/marketing");
  const studio = page.locator(".social-generator");
  const choices = studio.locator(".marketing-product-picker input[type=checkbox]");
  await studio.getByLabel("Business logo URL").fill("/brand-logo.jpg");
  await choices.nth(0).check();
  await choices.nth(1).check();
  await expect(studio.locator("canvas")).toBeVisible();
  await expect
    .poll(() => studio.locator("canvas").evaluate((canvas) => (canvas as HTMLCanvasElement).width))
    .toBe(1080);
  await expect(studio.locator(".social-generator-status")).not.toContainText("could not");
  await page.screenshot({ path: "test-results/marketing-preview.png", fullPage: true });
  const pngDownload = page.waitForEvent("download");
  await studio.getByRole("button", { name: "Download this post" }).click();
  const png = await pngDownload;
  const pngPath = await png.path();
  expect(pngPath).toBeTruthy();
  if (!pngPath) throw new Error("PNG download missing.");
  const bytes = await fs.readFile(pngPath);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.readUInt32BE(16)).toBe(1080);
  expect(bytes.readUInt32BE(20)).toBe(1350);
  const zipDownload = page.waitForEvent("download");
  await studio.getByRole("button", { name: "Download all 2" }).click();
  const zip = await zipDownload;
  const zipPath = await zip.path();
  expect(zipPath).toBeTruthy();
  if (!zipPath) throw new Error("ZIP download missing.");
  const entries = unzipSync(new Uint8Array(await fs.readFile(zipPath)));
  expect(Object.keys(entries)).toHaveLength(2);
  for (const image of Object.values(entries))
    expect([...image.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  await studio.getByLabel("Business logo URL").fill("/missing-fixture-logo.jpg");
  await expect(studio.locator(".social-generator-status")).toContainText("business logo could not be loaded");
  await studio.getByLabel("Business logo URL").fill("/brand-logo.jpg");
  await expect(studio.locator(".social-generator-status")).not.toContainText("could not");
  await page.route("**/_next/image?**", (route) => route.fulfill({ status: 404, body: "missing" }));
  await page.reload();
  await studio.locator(".marketing-product-picker input[type=checkbox]").first().check();
  await expect(studio.locator(".social-generator-status")).toContainText("could not be loaded");
  await studio.getByRole("button", { name: "Download this post" }).click();
  await expect(studio.locator(".social-generator-status")).toContainText("could not be loaded");
});

import { cakeQuoteContent } from "../src/lib/documents/cake-quote-preview";
import { createHmac } from "node:crypto";
import { expect, test, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function authenticate(context: BrowserContext) {
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100");
  const payload = `fixture-token.${Math.floor(Date.now() / 1000) + 3600}`;
  const signature = createHmac("sha256", "isolated-ndee-browser-secret-32-characters")
    .update(`cookie:${payload}`)
    .digest("hex");
  await context.addCookies([
    { name: "ndee_admin_session", value: `${payload}.${signature}`, url: origin.origin, httpOnly: true },
  ]);
}
test.beforeEach(async ({ context }) => {
  test.skip(process.env.NDEE_BROWSER_FIXTURES !== "true", "Isolated fixtures only.");
  await authenticate(context);
});
test("invalid payment links explain recovery and completed payments stop polling", async ({ page }) => {
  await page.goto("/pay?session=invalid");
  await expect(page.getByRole("heading", { name: "This payment link is invalid" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Contact the bakery" })).toHaveAttribute("href", "/contact");
  let reads = 0;
  await page.route("**/api/payments/status?**", (route) => {
    reads++;
    return route.fulfill({ json: { payment: { status: "SUCCEEDED", orderNumber: "ND-DONE" } } });
  });
  await page.clock.install();
  await page.goto("/order-success?session_id=cs_test_done");
  await expect(page.getByRole("link", { name: "Track this order" })).toBeVisible();
  const completedReads = reads;
  expect(completedReads).toBeLessThanOrEqual(2);
  await page.clock.fastForward(15 * 60000);
  expect(reads).toBe(completedReads);
});
test("pending payment polling backs off and pauses in hidden tabs", async ({ page }) => {
  let reads = 0;
  await page.route("**/api/payments/status?**", (route) => {
    reads++;
    return route.fulfill({ json: { payment: { status: "PENDING" } } });
  });
  await page.clock.install();
  await page.goto("/order-success?session_id=cs_test_pending");
  await expect(page.getByText("Checking for Stripe confirmation…")).toBeVisible();
  for (let index = 0; index < 60; index++) await page.clock.runFor(15000);
  expect(reads).toBeLessThan(40);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const previous = reads;
  await page.clock.runFor(60000);
  expect(reads).toBe(previous);
});
test("customers search all history and inventory CSV requires review before writes", async ({ page }, testInfo) => {
  await page.route("**/api/admin/customers?**", (route) =>
    route.fulfill({
      json: {
        rows: [
          {
            name: "Longstanding customer",
            email: "history@example.test",
            orders: 300,
            spent: 120000,
            last: "2026-10-10",
          },
        ],
        total: 5001,
      },
    }),
  );
  await page.goto("/admin/customers");
  await expect(page.getByText("Longstanding customer")).toBeVisible();
  await expect(page.getByText("5001 matching customers", { exact: false })).toBeVisible();
  await page.getByLabel("Search all customers").fill("history");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("Longstanding customer")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).include("#admin-main-content").analyze()).violations.filter((value) =>
      ["serious", "critical"].includes(value.impact ?? ""),
    ),
  ).toEqual([]);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: testInfo.outputPath("customers.png"), fullPage: true });
  await page.route("**/api/admin/inventory?**", (route) =>
    route.fulfill({ json: { products: [], total: 0, counts: {} } }),
  );
  let writes = 0;
  await page.route("**/api/admin/inventory/bulk", (route) => {
    writes++;
    return route.fulfill({
      json: {
        results: [
          {
            variantId: "22222222-2222-4222-8222-222222222222",
            saved: false,
            error: "Stock changed. Export fresh quantities before retrying.",
          },
        ],
      },
    });
  });
  await page.goto("/admin/inventory");
  await page.getByText("Bulk stock updates and CSV", { exact: true }).click();
  await page.getByLabel("Import stock CSV").setInputFiles({
    name: "stock.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "productId,variantId,expected,mode,quantity\n11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222,12,set,15",
    ),
  });
  await expect(page.getByText("1 adjustments ready for review.")).toBeVisible();
  expect(writes).toBe(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Confirm bulk adjustments" }).click();
  await expect(page.getByText("0 saved · 1 rejected")).toBeVisible();
  expect(writes).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: testInfo.outputPath("inventory-bulk.png"), fullPage: true });
});

test("browser history isolates order drafts while the next record loads", async ({ page }) => {
  const makeOrder = (id: string) => ({
    id,
    customer: `Customer ${id}`,
    email: `${id}@example.test`,
    phone: "555",
    total: 10000,
    status: "PAID",
    date: "2026-10-10",
    items: 1,
    fulfilment: "pickup",
    currency: "CAD",
    subtotal: 10000,
    discountTotal: 0,
    deliveryFee: 0,
    taxTotal: 0,
    internalNote: `Saved note ${id}`,
    customerNote: "",
    address: null,
    payment: { status: "SUCCEEDED", amount: 10000, refundedAmount: 0, paidAt: "2026-10-10" },
    lines: [],
    events: [],
  });
  let release: (() => void) | undefined;
  await page.route("**/api/admin/history/orders**", async (route) => {
    const url = new URL(route.request().url());
    const id = url.pathname.split("/")[5];
    if (id) {
      if (id === "ND-B")
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      await route.fulfill({ json: makeOrder(id) });
    } else
      await route.fulfill({
        json: { rows: [], total: 0, counts: {}, page: 1, size: 25, asOf: "2026-10-11T00:00:00Z" },
      });
  });
  await page.goto("/admin/orders?detail=ND-A");
  await expect(page.getByRole("heading", { name: "ND-A", exact: true })).toBeVisible();
  await page.getByText("Internal note", { exact: true }).click();
  await page.getByLabel("Only administrators can see this").fill("Unsaved A draft");
  await page.evaluate(() => {
    history.pushState(null, "", "/admin/orders?detail=ND-B");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByRole("heading", { name: "ND-A", exact: true })).not.toBeVisible();
  await expect(page.getByLabel("Only administrators can see this")).not.toBeVisible();
  await expect.poll(() => Boolean(release)).toBe(true);
  release?.();
  await expect(page.getByRole("heading", { name: "ND-B", exact: true })).toBeVisible();
  await page.getByText("Internal note", { exact: true }).click();
  await expect(page.getByLabel("Only administrators can see this")).toHaveValue("Saved note ND-B");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "ND-A", exact: true })).toBeVisible();
  await page.getByText("Internal note", { exact: true }).click();
  await expect(page.getByLabel("Only administrators can see this")).toHaveValue("Saved note ND-A");
});

test("cake navigation clears the previous amount and preview approval", async ({ page }, testInfo) => {
  const first = "11111111-1111-4111-8111-111111111111";
  const second = "22222222-2222-4222-8222-222222222222";
  const makeCake = (id: string) => ({
    id,
    requestNumber: id === first ? "CAKE-A" : "CAKE-B",
    customerName: "Customer",
    email: "customer@example.test",
    phone: "555",
    status: "QUOTE_REQUIRED",
    configuration: {},
    requestedDate: "2027-01-01",
    estimatedTotal: null,
    quotedTotal: id === first ? 10000 : 20000,
    customerNote: null,
    referenceUrls: [],
    orderId: null,
    quoteDelivery: null,
    communications: [],
  });
  const [{ value: business }] = await (
    await page.request.get("http://127.0.0.1:4545/rest/v1/site_settings?key=eq.business")
  ).json();
  await page.route("**/api/admin/history/cakes**", (route) => {
    const id = new URL(route.request().url()).pathname.split("/")[5];
    return route.fulfill({
      json: id ? makeCake(id) : { rows: [], total: 0, counts: {}, page: 1, size: 25, asOf: "2026-10-11T00:00:00Z" },
    });
  });
  await page.route("**/api/admin/cakes/*/quote-preview", (route) =>
    route.fulfill({
      json: {
        approvalToken: "fixture-reviewed-a",
        ...cakeQuoteContent(
          {
            request_number: "CAKE-A",
            customer_name: "Customer",
            email: "customer@example.test",
            phone: "555",
            configuration: {},
            requested_date: "2027-01-01",
            customer_note: null,
          },
          business,
          15000,
          { accentColor: "#792f49" },
        ),
      },
    }),
  );
  await page.goto(`/admin/custom-cakes?detail=${first}`);
  const amount = page.getByLabel("Quote amount (CAD)");
  await expect(amount).toHaveValue("100");
  await amount.fill("150");
  await page.getByRole("button", { name: "Preview quote", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Quotation preview" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Send revised quote", exact: true })).toBeEnabled();
  await page.evaluate((id) => {
    history.pushState(null, "", `/admin/custom-cakes?detail=${id}`);
    dispatchEvent(new PopStateEvent("popstate"));
  }, second);
  await expect(amount).toHaveValue("200");
  await expect(page.getByRole("button", { name: "Send revised quote", exact: true })).toBeDisabled();
  await page.goBack();
  await expect(amount).toHaveValue("100");
  await expect(page.getByRole("button", { name: "Send revised quote", exact: true })).toBeDisabled();
  await page.goto("/admin/custom-cakes");
  await page.getByRole("tab", { name: /My cakes & options/ }).click();
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: testInfo.outputPath("cake-default.png"), fullPage: true });
});

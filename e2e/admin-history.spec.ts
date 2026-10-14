import { createHmac } from "node:crypto";
import { cakeQuoteContent } from "../src/lib/documents/cake-quote-preview";
import { expect, test } from "@playwright/test";

const order = {
  id: "ORD-101",
  customer: "A very long customer name for a celebration",
  email: "a-very-long-customer-address-that-must-wrap@example.invalid",
  phone: "+19025551234",
  total: 11300,
  status: "PREPARING",
  date: "2026-01-01T12:00:00Z",
  items: 1,
  fulfilment: "pickup",
  currency: "CAD",
  subtotal: 10000,
  discountTotal: 0,
  deliveryFee: 0,
  taxTotal: 1300,
  internalNote: "",
  customerNote: "Please call when ready",
  address: null,
  payment: { status: "SUCCEEDED", amount: 11300, refundedAmount: 0, paidAt: "2026-01-01T12:00:00Z" },
  lines: [
    {
      id: "line-1",
      productName: "Celebration cake with a long product description",
      variantName: "Vanilla and buttercream",
      sku: "SKU-1",
      unitPrice: 10000,
      quantity: 1,
      discount: 0,
      finalPrice: 10000,
    },
  ],
  events: [],
};
const request = {
  id: "11111111-1111-4111-8111-111111111111",
  requestNumber: "CAKE-101",
  customerName: order.customer,
  email: order.email,
  phone: order.phone,
  status: "QUOTE_REQUIRED",
  configuration: {
    occasion: "Birthday",
    flavour: "Vanilla",
    size: "Large",
    filling: "Buttercream",
    cakeType: "Birthday cake",
  },
  requestedDate: "2027-01-01",
  estimatedTotal: null,
  quotedTotal: null,
  customerNote: "A special celebration",
  referenceUrls: ["/brand-logo.jpg"],
  orderId: null,
  quoteDelivery: null,
};
async function overflow(page: import("@playwright/test").Page) {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.width + 1);
  const dialog = page.getByRole("dialog");
  if (await dialog.count()) expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
}
test("history pagination, full-history query, detail fetch, URL restoration and responsive workflows", async ({
  page,
  context,
}, testInfo) => {
  test.skip(process.env.NDEE_BROWSER_FIXTURES !== "true", "Requires isolated local fixture server.");
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100");
  expect(["localhost", "127.0.0.1"]).toContain(origin.hostname);
  const payload = `fixture-token.${Math.floor(Date.now() / 1000) + 3600}`;
  const signature = createHmac("sha256", "isolated-ndee-browser-secret-32-characters")
    .update(`cookie:${payload}`)
    .digest("hex");
  await context.addCookies([
    { name: "ndee_admin_session", value: `${payload}.${signature}`, url: origin.origin, httpOnly: true },
  ]);
  const queries: URL[] = [];
  let detailRequests = 0;
  let orderStage = "PREPARING";
  let failNext = false;
  await page.route("**/api/admin/history/**", async (route) => {
    const url = new URL(route.request().url());
    const kind = url.pathname.split("/")[4];
    if (url.pathname.split("/").length > 5) {
      detailRequests++;
      await route.fulfill({
        json:
          kind === "orders"
            ? { ...order, id: decodeURIComponent(url.pathname.split("/").at(-1) ?? ""), status: orderStage }
            : request,
      });
      return;
    }
    queries.push(url);
    if (failNext) {
      failNext = false;
      await route.fulfill({ status: 503, json: { error: "Fixture load failure" } });
      return;
    }
    const currentPage = Number(url.searchParams.get("page") || 1);
    const filtered = Boolean(url.searchParams.get("q"));
    await route.fulfill({
      json: {
        rows: [
          {
            id: kind === "orders" ? "order-id" : request.id,
            number: kind === "orders" ? (currentPage === 1 && !filtered ? "ORD-101" : "ORD-1") : "CAKE-101",
            customer: order.customer,
            status: kind === "orders" ? orderStage : "QUOTE_REQUIRED",
            createdAt: order.date,
            total: kind === "orders" ? 11300 : null,
            currency: "CAD",
            fulfilment: "pickup",
            paymentStatus: kind === "orders" ? "SUCCEEDED" : null,
            deadline: "2027-01-01",
            occasion: "Birthday",
            items: order.items,
          },
        ],
        total: filtered ? 1 : 101,
        counts: { ALL: 101, PREPARING: 72, NEEDS_QUOTE: 29 },
        page: currentPage,
        size: Number(url.searchParams.get("size") || 25),
        asOf: "2026-10-10T12:00:00Z",
      },
    });
  });
  const [{ value: business }] = await (
    await page.request.get("http://127.0.0.1:4545/rest/v1/site_settings?key=eq.business")
  ).json();
  await page.route("**/api/admin/cakes/*/quote-preview", (route) => {
    const { quotedTotal } = route.request().postDataJSON();
    return route.fulfill({
      json: {
        approvalToken: "fixture-approval",
        ...cakeQuoteContent(
          {
            request_number: request.requestNumber,
            customer_name: request.customerName,
            email: request.email,
            phone: request.phone,
            configuration: request.configuration,
            requested_date: request.requestedDate,
            customer_note: request.customerNote,
          },
          business,
          quotedTotal,
          { accentColor: "#792f49" },
        ),
      },
    });
  });
  await page.route("**/api/admin/orders/bulk", (route) => {
    orderStage = "READY";
    return route.fulfill({
      json: { results: [{ number: "ORD-101", outcome: "successful", message: "Advanced to ready." }] },
    });
  });
  let stock = 3;
  let stockWrites = 0;
  await page.route("**/api/admin/inventory?**", (route) =>
    route.fulfill({
      json: {
        products: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Fixture cake",
            slug: "fixture-cake",
            category: "PASTRIES",
            price: 1000,
            status: "ACTIVE",
            trackInventory: true,
            stockQuantity: stock,
            lowStockThreshold: 5,
            variants: [
              {
                id: "33333333-3333-4333-8333-333333333333",
                name: "Vanilla",
                sku: "CAKE-VANILLA",
                stockQuantity: stock,
                active: true,
              },
            ],
            images: [],
            image: "",
            shortDescription: "Cake",
            description: "Cake",
            featured: false,
            allergens: [],
          },
        ],
        counts: { ALL: 1, LOW: stock <= 5 ? 1 : 0, OUT: 0, ATTENTION: stock <= 5 ? 1 : 0 },
        total: 1,
        page: 1,
        size: 25,
      },
    }),
  );
  await page.route("**/api/admin/inventory/adjust", (route) => {
    const body = route.request().postDataJSON();
    stockWrites++;
    expect(body.expected).toBe(stock);
    stock += body.quantity;
    return route.fulfill({ json: { quantity: stock } });
  });
  await page.goto("/admin/orders");
  await expect(page.getByText(/^101 matching orders\./)).toBeVisible();
  expect(detailRequests).toBe(0);
  await page.getByRole("checkbox", { name: "Select ORD-101" }).check();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Advance selected (1)" }).click();
  await expect(page.getByText("ORD-101 · successful: Advanced to ready.")).toBeVisible();
  await expect(page.locator(".history-status")).toContainText("ready");
  await overflow(page);
  await page.screenshot({ path: testInfo.outputPath("orders-list.png"), fullPage: true });
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 of 5")).toBeVisible();
  expect(queries.at(-1)?.searchParams.get("asOf")).toBe("2026-10-10T12:00:00Z");
  await page.getByLabel("Search history").fill("buyer1@example.invalid");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText(/^1 matching orders\./)).toBeVisible();
  expect(queries.at(-1)?.searchParams.get("q")).toBe("buyer1@example.invalid");
  await page.reload();
  await expect(page.getByLabel("Search history")).toHaveValue("buyer1@example.invalid");
  await page.getByRole("button", { name: "Manage order" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Order items" })).toBeVisible();
  await overflow(page);
  await page.screenshot({ path: testInfo.outputPath("order-details.png"), fullPage: false });
  const balance = page.getByRole("heading", { name: "Payment and balance", exact: true });
  await balance.scrollIntoViewIfNeeded();
  await expect(balance).toBeInViewport();
  await expect(page.getByText("Outstanding balance:", { exact: false })).toContainText("$0.00");
  await page.screenshot({ path: testInfo.outputPath("order-payment-details.png"), fullPage: false });
  await page.getByRole("button", { name: "Back to orders", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Back to orders", exact: true })).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByLabel("Search history")).toHaveValue("buyer1@example.invalid");
  failNext = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("Fixture load failure")).toBeVisible();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText(/^1 matching orders\./)).toBeVisible();
  await page.goto("/admin/custom-cakes");
  await expect(page.getByRole("button", { name: "Review request" })).toBeVisible();
  await overflow(page);
  await page.screenshot({ path: testInfo.outputPath("cake-requests.png"), fullPage: true });
  await page.getByRole("button", { name: "Review request" }).click();
  await expect(page.getByText("Cake flavour", { exact: true })).toBeVisible();
  await page.getByLabel("Quote amount (CAD)").fill("200");
  await expect(page.getByRole("button", { name: "Send quote", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Preview quote", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Quotation preview" })).toBeVisible();
  await expect(page.locator(".document-meaning")).toContainText("Payment has not been received");
  await page.getByRole("button", { name: "Back to request", exact: true }).click();
  await expect(page.getByRole("button", { name: "Send quote", exact: true })).toBeEnabled();
  await page.getByLabel("Quote amount (CAD)").fill("201");
  await expect(page.getByRole("button", { name: "Send quote", exact: true })).toBeDisabled();
  await overflow(page);
  await page.screenshot({ path: testInfo.outputPath("cake-request-details.png"), fullPage: false });
  page.once("dialog", (dialog) => dialog.accept());
  await page.keyboard.press("Escape");
  await page.goto("/admin/inventory");
  await page.getByRole("button", { name: /All stock/ }).click();
  await expect(page.getByText("Fixture cake", { exact: true })).toBeVisible();
  await page.getByText("Fixture cake", { exact: true }).click();
  const stockGroup = page.locator(".inventory-product-group").filter({ hasText: "Fixture cake" });
  await stockGroup.locator(".stock-stepper input").first().fill("5");
  expect(stockWrites).toBe(0);
  await stockGroup.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect.poll(() => stockWrites).toBe(1);
  await expect(page.getByText("Loading stock…", { exact: true })).not.toBeVisible();
  await expect(page.getByText(/5 in stock/)).toBeVisible();
  await overflow(page);
  await page.screenshot({ path: testInfo.outputPath("inventory.png"), fullPage: true });
});

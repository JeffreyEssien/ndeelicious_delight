import { createHmac } from "node:crypto";
import { test, expect } from "@playwright/test";
test("capture original admin interfaces from immutable source", async ({ page, context }, testInfo) => {
  test.skip(process.env.NDEE_CAPTURE_BEFORE !== "true", "Only run against the isolated baseline checkout.");
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3101");
  expect(origin.origin).toBe("http://localhost:3101");
  const payload = `fixture-token.${Math.floor(Date.now() / 1000) + 3600}`;
  const signature = createHmac("sha256", "isolated-ndee-browser-secret-32-characters")
    .update(`cookie:${payload}`)
    .digest("hex");
  await context.addCookies([
    { name: "ndee_admin_session", value: `${payload}.${signature}`, url: origin.origin, httpOnly: true },
  ]);
  const orders = Array.from({ length: 5 }, (_, i) => ({
    id: `55555555-5555-4555-8555-${String(i).padStart(12, "0")}`,
    order_number: `ORD-${101 - i}`,
    customer_name: "A very long customer name for a celebration",
    email: "a-very-long-customer-address-that-must-wrap@example.invalid",
    phone: "+19025551234",
    grand_total: 11300,
    subtotal: 10000,
    discount_total: 0,
    delivery_fee: 0,
    tax_total: 1300,
    currency: "CAD",
    status: "PREPARING",
    created_at: "2026-01-01T12:00:00Z",
    fulfilment: "pickup",
    delivery_address_snapshot: null,
    customer_note: "Please call when ready",
    internal_note: "",
    order_items: [
      {
        id: "line-1",
        product_name: "Celebration cake with a long product description",
        variant_name: "Vanilla and buttercream",
        sku: "SKU-1",
        unit_price: 10000,
        quantity: 3,
        discount: 0,
        final_price: 10000,
      },
    ],
    payments: [{ status: "SUCCEEDED", amount: 11300, refunded_amount: 0, paid_at: "2026-01-01T12:00:00Z" }],
    order_events: [],
  }));
  await page.request.post("http://127.0.0.1:4545/rest/v1/orders", { data: orders });
  await page.request.post("http://127.0.0.1:4545/rest/v1/custom_cake_orders", {
    data: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        request_number: "CAKE-101",
        customer_name: orders[0].customer_name,
        email: orders[0].email,
        phone: orders[0].phone,
        status: "QUOTE_REQUIRED",
        configuration: {
          occasion: "Birthday",
          flavour: "Vanilla",
          size: "Large",
          filling: "Buttercream",
          cakeType: "Birthday cake",
        },
        requested_date: "2027-01-01",
        estimated_total: null,
        quoted_total: null,
        customer_note: "A special celebration",
        reference_urls: [],
        order_id: null,
      },
    ],
  });
  await page.goto("/admin/orders");
  await expect(page.getByRole("button", { name: "View order" }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("orders-list-before.png"), fullPage: true });
  await page.getByRole("button", { name: "View order" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("order-details-before.png") });
  await page.keyboard.press("Escape");
  await page.goto("/admin/custom-cakes");
  await expect(page.getByRole("heading", { name: /cake for/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("cake-requests-before.png"), fullPage: true });
  await page.goto("/admin/cakes");
  await page.screenshot({ path: testInfo.outputPath("cake-management-before.png"), fullPage: true });
  await page.goto("/admin/inventory");
  await page.screenshot({ path: testInfo.outputPath("inventory-before.png"), fullPage: true });
});

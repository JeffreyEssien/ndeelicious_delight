import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
test("commercial document previews and authorized PDF downloads", async ({ page, context }, testInfo) => {
  test.skip(process.env.NDEE_BROWSER_FIXTURES !== "true", "Requires isolated local sample data.");
  test.setTimeout(90000);
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100");
  expect(["localhost", "127.0.0.1"]).toContain(origin.hostname);
  const payload = `fixture-token.${Math.floor(Date.now() / 1000) + 3600}`;
  const signature = createHmac("sha256", "isolated-ndee-browser-secret-32-characters")
    .update(`cookie:${payload}`)
    .digest("hex");
  await context.addCookies([
    { name: "ndee_admin_session", value: `${payload}.${signature}`, url: origin.origin, httpOnly: true },
  ]);
  await page.request.post("http://127.0.0.1:4545/__fixtures/reset");
  const [{ value: business }] = await (
    await page.request.get("http://127.0.0.1:4545/rest/v1/site_settings?key=eq.business")
  ).json();
  const orderId = "55555555-5555-4555-8555-555555555555";
  const cakeId = "66666666-6666-4666-8666-666666666666";
  await page.request.post("http://127.0.0.1:4545/rest/v1/orders", { data: { id: orderId, order_number: "DOC-ORDER" } });
  await page.request.post("http://127.0.0.1:4545/rest/v1/custom_cake_orders", {
    data: { id: cakeId, request_number: "DOC-CAKE" },
  });
  for (const [index, kind] of ["INVOICE", "RECEIPT", "QUOTE"].entries())
    for (const design of ["classic", "modern", "minimal"]) {
      const id = `77777777-7777-4777-8777-${String(index).padStart(12, "0")}`;
      const data = {
        id,
        order_id: kind === "QUOTE" ? null : orderId,
        cake_order_id: kind === "QUOTE" ? cakeId : null,
        kind,
        number: `${kind}-FIXTURE`,
        revision: 1,
        state: kind === "RECEIPT" ? "PAID" : "ISSUED",
        issued_at: "2026-01-01T12:00:00Z",
        valid_until: kind === "QUOTE" ? "2027-01-01T12:00:00Z" : null,
        due_at: null,
        business_snapshot: { ...business, taxRegistrationNumber: "FIXTURE-HST" },
        customer_snapshot: {
          name: "Élodie François",
          email: "long-customer-address-for-print@example.invalid",
          phone: "+19025551234",
          address: "123 Celebration Street, Halifax, NS, Canada",
        },
        line_items_snapshot: Array.from({ length: 4 }, (_, i) => ({
          id: String(i),
          name: `Celebration cake ${i + 1} — Crème brûlée`,
          detail: "Vanilla sponge, buttercream and a custom celebration finish",
          quantity: 1,
          unitPrice: 2500,
          total: 2500,
        })),
        totals_snapshot: {
          subtotal: 10000,
          tax: 1400,
          total: 11400,
          paid: kind === "RECEIPT" ? 11400 : 0,
          amountDue: kind === "RECEIPT" ? 0 : 11400,
        },
        branding_snapshot: { accentColor: "#792f49", logoUrl: "/brand-logo.jpg" },
        presentation_snapshot: {
          design,
          notes: ["Prepared with care for your celebration."],
          showSku: false,
          showPaymentDetails: true,
        },
      };
      await page.request.post("http://127.0.0.1:4545/rest/v1/business_documents", { data });
      await page.goto(
        kind === "QUOTE"
          ? "/admin/documents/cakes/DOC-CAKE/quote"
          : `/admin/documents/orders/DOC-ORDER/${kind.toLowerCase()}`,
      );
      await expect(page.locator(".business-document h1")).toBeVisible();
      await expect(page.locator("body")).toHaveClass(/admin-mode/);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      });
      await expect(page.locator(".business-document h1")).toHaveText(`${kind}-FIXTURE`);
      await expect(page.locator(".business-document")).toContainText("$114.00");
      const dimensions = await page.evaluate(() => ({
        width: innerWidth,
        content: document.documentElement.scrollWidth,
      }));
      if (process.env.NDEE_CAPTURE_BEFORE !== "true")
        expect(dimensions.content).toBeLessThanOrEqual(dimensions.width + 1);
      if (process.env.NDEE_CAPTURE_BEFORE !== "true") {
        await page.emulateMedia({ media: "print" });
        await expect(page.locator(".business-document h1")).toBeVisible();
        await page.emulateMedia({ media: "screen" });
        for (const button of await page.locator(".document-editor-actions .button").all()) {
          const boxes = await button.evaluate((el) => ({
            button: el.getBoundingClientRect().toJSON(),
            parent: (el.parentElement ?? el).getBoundingClientRect().toJSON(),
          }));
          expect(boxes.button.right).toBeLessThanOrEqual(boxes.parent.right + 1);
        }
      }
      await page.screenshot({ path: testInfo.outputPath(`${kind.toLowerCase()}-${design}.png`), fullPage: true });
      const response = await page.request.get(`/api/admin/documents/${id}/pdf`);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toBe("application/pdf");
      const bytes = await response.body();
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    }
});

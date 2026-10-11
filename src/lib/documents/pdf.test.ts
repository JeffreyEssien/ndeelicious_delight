import { describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { documentTextLines, renderDocumentPdf } from "./pdf";
import { documentTotals } from "./presentation";
import type { DocumentDTO } from "./dto";
const document: DocumentDTO = {
  id: "doc-1",
  revision: 1,
  kind: "Receipt",
  number: "RCT-100",
  issuedAt: "2026-09-26T12:00:00Z",
  status: "PAID",
  customer: { name: "Ada Customer", email: "ada@example.com" },
  lines: [{ id: "1", name: "Cake", detail: "Vanilla", quantity: 1, unitPrice: 1000, total: 1000 }],
  subtotal: 1000,
  tax: 130,
  total: 1130,
  paid: 1130,
  business: {
    businessName: "Ndeelicious Delight",
    contactEmail: "hello@example.com",
    phone: "",
    whatsapp: "",
    address: "Toronto",
    country: "CA",
    province: "ON",
    postalCode: "M1M 1M1",
    locale: "en-CA",
    timezone: "America/Toronto",
    openingHours: "",
    currency: "CAD",
    instagramUrl: "",
    deliveryEnabled: true,
    pickupEnabled: true,
    orderMinimum: 0,
    taxEnabled: true,
    taxLabel: "HST",
    taxRegistrationNumber: "123",
    taxRateBps: 1300,
    taxDelivery: true,
  },
};
async function extract(input: DocumentDTO) {
  const buffer = await renderDocumentPdf(input);
  const loading = getDocument({ data: new Uint8Array(buffer), useSystemFonts: false });
  const pdf = await loading.promise;
  const pages = [];
  const links = [];
  for (let index = 1; index <= pdf.numPages; index++) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    links.push(...(await page.getAnnotations()));
    for (const item of content.items)
      if ("str" in item && item.str) {
        expect(item.transform[4]).toBeGreaterThanOrEqual(0);
        expect(item.transform[4] + item.width).toBeLessThanOrEqual(614);
        expect(item.transform[5]).toBeGreaterThan(0);
        expect(item.transform[5]).toBeLessThan(792);
      }
  }
  await loading.destroy();
  return { buffer, pages, text: pages.join(" "), links };
}
describe("commercial PDF rendering", () => {
  it("preserves configured wording and Canadian financial totals", async () => {
    const result = await extract({
      ...document,
      customerText: {
        "business document": {
          Total: "Payable total",
          Receipt: "Payment receipt",
          "Page {page} of {pages}": "Sheet {page}/{pages}",
        },
      },
    });
    expect(result.text).toContain("Payable total");
    expect(result.text).toContain("PAYMENT RECEIPT RCT-100");
    expect(result.text).toContain("Sheet 1/1");
    expect(result.text).toContain("$11.30");
    expect(result.text).toContain("HST (13%)");
    expect(documentTextLines(document)).toContain("HST (13%): $1.30");
    expect(result.buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });
  it("includes a labelled, clickable WhatsApp link", async () => {
    const result = await extract({ ...document, business: { ...document.business, whatsapp: "+19025551234" } });
    expect(result.text).toContain("Chat with us on WhatsApp");
    expect(result.links.some((link) => link.url === "https://wa.me/19025551234")).toBe(true);
  });
  it.each(["classic", "modern", "minimal"] as const)(
    "retains long details, Unicode and every item in %s documents",
    async (design) => {
      const lines = Array.from({ length: 70 }, (_, index) => ({
        id: String(index),
        name: `Celebration cake line ${index + 1} — Crème brûlée`,
        detail: "Vanilla sponge with a detailed buttercream finish",
        quantity: 1,
        unitPrice: 1000,
        total: 1000,
      }));
      const result = await extract({
        ...document,
        design,
        customer: {
          ...document.customer,
          name: "Élodie François – Łukasz · Ζωή · Иван",
          address: "123 Very Long Canadian Business Address ".repeat(15),
          email: `${"long-address-".repeat(20)}@example.invalid`,
        },
        lines,
        subtotal: 70000,
        total: 70000,
        paid: 70000,
      });
      expect(result.pages.length).toBeGreaterThan(2);
      expect(result.text).toContain("Élodie François");
      expect(result.text).toContain("Ζωή");
      expect(result.text).toContain("Иван");
      expect(result.text).toContain("Łukasz");
      for (let index = 1; index <= 70; index++) expect(result.text).toContain(`Celebration cake line ${index}`);
      for (const page of result.pages.slice(1))
        if (page.includes("Celebration cake line")) expect(page).toContain("Description");
      expect(result.text).toContain("Crème brûlée");
      expect(result.text).toContain("$700.00");
    },
  );
  it.each([
    { kind: "Invoice", paid: 0, amountDue: 1130, status: "ISSUED" },
    { kind: "Invoice", paid: 1130, amountDue: 0, status: "PAID" },
    { kind: "Receipt", paid: 1130, refunded: 500, status: "PARTIALLY_REFUNDED" },
    { kind: "Receipt", paid: 1130, refunded: 1130, status: "REFUNDED" },
    { kind: "Quote", paid: 0, status: "ISSUED" },
  ] as const)("uses correct semantics for $kind / $status", async (caseData) => {
    const input = { ...document, ...caseData };
    const snapshot = JSON.stringify(input);
    const result = await extract(input);
    expect(JSON.stringify(input)).toBe(snapshot);
    for (const total of documentTotals(input)) expect(result.text).toContain(total.label);
    if (input.kind === "Quote") {
      expect(result.text).toContain("Payment has not been received");
      expect(documentTotals(input).some((row) => row.label === "Paid")).toBe(false);
    }
  });
  it("fails explicitly for unsupported script instead of substituting hyphens", async () => {
    await expect(renderDocumentPdf({ ...document, customer: { ...document.customer, name: "漢字" } })).rejects.toThrow(
      "PDF font does not support",
    );
  });
});

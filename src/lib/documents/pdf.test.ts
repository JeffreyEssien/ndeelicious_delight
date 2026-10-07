import { describe, expect, it } from "vitest";
import { documentTextLines, renderDocumentPdf } from "./pdf";

const document = {
  id: "doc-1",
  revision: 1,
  kind: "Receipt" as const,
  number: "RCT-100",
  issuedAt: "2026-09-26T12:00:00.000Z",
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
    country: "CA" as const,
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

describe("document PDF", () => {
  it("uses owner wording in downloadable PDFs without changing amounts", () => {
    const pdf = renderDocumentPdf({
      ...document,
      customerText: {
        "business document": {
          Total: "Payable total",
          Receipt: "Payment receipt",
          "Page {page} of {pages}": "Sheet {page}/{pages}",
        },
      },
    }).toString("latin1");
    expect(pdf).toContain("Payable total");
    expect(pdf).toContain("PAYMENT RECEIPT RCT-100");
    expect(pdf).toContain("Sheet 1/1");
    expect(pdf).toContain("$11.30");
  });
  it("prints a labelled clickable WhatsApp link rather than a raw number", () => {
    const pdf = renderDocumentPdf({
      ...document,
      business: { ...document.business, whatsapp: "+19025551234" },
    }).toString("latin1");
    expect(pdf).toContain("Chat with us on WhatsApp");
    expect(pdf).toContain("/Subtype /Link");
    expect(pdf).toContain("/URI (https://wa.me/19025551234)");
  });
  it("uses the normalized DTO and Canadian configured tax label", () => {
    expect(documentTextLines(document)).toContain("HST (13%): $1.30");
    expect(renderDocumentPdf(document).subarray(0, 8).toString()).toBe("%PDF-1.4");
  });

  it("paginates long documents without dropping line items", () => {
    const lines = Array.from({ length: 70 }, (_, index) => ({
      id: String(index),
      name: `Celebration cake line ${index + 1}`,
      detail: "Vanilla sponge with a detailed buttercream finish",
      quantity: 1,
      unitPrice: 1000,
      total: 1000,
    }));
    const pdf = renderDocumentPdf({ ...document, lines, subtotal: 70_000, total: 70_000, paid: 70_000 }).toString(
      "latin1",
    );
    expect(pdf).toMatch(/\/Count [2-9]/);
    expect(pdf).toContain("Celebration cake line 70");
    expect(pdf).toContain("Page 1 of");
  });
});

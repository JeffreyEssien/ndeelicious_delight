import { expect, it } from "vitest";
import { persistedDocumentToDTO, type PersistedDocument } from "./dto";
it("routes an old invoice payment URL through renewal without modifying saved financial data", () => {
  const original = {
    id: "doc",
    order_id: "order",
    cake_order_id: null,
    valid_until: null,
    due_at: null,
    kind: "INVOICE",
    number: "INV-1",
    state: "ISSUED",
    revision: 1,
    issued_at: "2026-10-05T12:00:00Z",
    customer_snapshot: { name: "Buyer", email: "buyer@example.invalid" },
    line_items_snapshot: [],
    totals_snapshot: { subtotal: 100, total: 100, amountDue: 100 },
    business_snapshot: {
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
    branding_snapshot: { accentColor: "#792f49" },
    presentation_snapshot: { payNowUrl: "https://checkout.stripe.com/c/pay/cs_test_expired#example" },
  } satisfies PersistedDocument;
  const before = JSON.stringify(original);
  const result = persistedDocumentToDTO(original);
  expect(result.payNowUrl).toBe("/pay?session=cs_test_expired");
  expect(result.amountDue).toBe(100);
  expect(JSON.stringify(original)).toBe(before);
});

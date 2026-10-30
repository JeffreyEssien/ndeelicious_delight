import { describe, expect, it } from "vitest";
import { orderCopy, orderEmailCopy, orderStatusEmail, type OrderEmailData } from "./order-email";

const t = (text: string, values: Record<string, string | number> = {}) =>
  text.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
const base: OrderEmailData = {
  event: "PREPARING",
  customerName: "Ada <b>Okafor</b>",
  orderNumber: "ND-1001",
  fulfilment: "pickup",
  items: [{ name: "Meat pies <6>", detail: "Box of 6", quantity: 2, total: 4998 }],
  totals: { subtotal: 4998, discount: 0, delivery: 0, tax: 0, total: 4998 },
  currency: "CAD",
  locale: "en-CA",
  pickup: { address: "56 Supreme Ct, Halifax, NS", hours: "Mon–Sat 10–6", instructions: "Ring the side door" },
  trackUrl: "https://shop.example/track-order?order=ND-1001",
  businessName: "Ndeeelicious Delight",
  accent: "#6516a3",
};

describe("order update email", () => {
  it("has copy for every order update, in both fulfilment methods", () => {
    for (const event of Object.keys(orderEmailCopy)) {
      expect(orderCopy(event, "pickup")?.body).toBeTruthy();
      expect(orderCopy(event, "delivery")?.body).toBeTruthy();
    }
    expect(orderCopy("SOMETHING_ELSE", "pickup")).toBeNull();
  });

  it("greets by first name and escapes everything the customer or owner typed", () => {
    const email = orderStatusEmail(t, base);
    expect(email?.html).toContain("Hi Ada,");
    expect(email?.html).toContain("Meat pies &lt;6&gt;");
    expect(email?.html).not.toContain("<b>Okafor</b>");
  });

  it("uses the store's theme colour and links to tracking", () => {
    const email = orderStatusEmail(t, base);
    expect(email?.html).toContain("#6516a3");
    expect(email?.html).toContain('href="https://shop.example/track-order?order=ND-1001"');
    expect(email?.subject).toBe("Your order is in the kitchen · ND-1001");
  });

  it("tells pickup customers where and when, and delivery customers where it's going", () => {
    const pickup = orderStatusEmail(t, { ...base, event: "READY" });
    expect(pickup?.subject).toContain("ready to collect");
    expect(pickup?.html).toContain("56 Supreme Ct, Halifax, NS");
    expect(pickup?.html).toContain("Ring the side door");
    const delivery = orderStatusEmail(t, {
      ...base,
      event: "READY",
      fulfilment: "delivery",
      pickup: undefined,
      deliveryAddress: "1234 Barrington St, Halifax",
      totals: { ...base.totals, delivery: 800, total: 5798 },
    });
    expect(delivery?.subject).toContain("packed");
    expect(delivery?.html).toContain("Delivering to");
    expect(delivery?.html).toContain("$8.00");
  });

  it("falls back to the brand colour when the accent isn't a plain hex colour", () => {
    const email = orderStatusEmail(t, { ...base, accent: "red;background:url(x)" });
    expect(email?.html).not.toContain("url(x)");
    expect(email?.html).toContain("#792f49");
  });

  it("matches the push notification to the email", () => {
    const email = orderStatusEmail(t, { ...base, event: "OUT_FOR_DELIVERY", fulfilment: "delivery" });
    expect(email?.pushTitle).toBe("On its way to you");
    expect(email?.pushBody).toContain("ND-1001");
  });
});

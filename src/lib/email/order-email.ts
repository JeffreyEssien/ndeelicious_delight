import { emailButton, emailFrame, escapeHtml } from "./mailer";
import { formatMoney } from "@/lib/format";

type Translate = (text: string, values?: Record<string, string | number>) => string;
type Copy = { subject: string; title: string; body: string };

/** Customer copy for each order update. Pickup and delivery differ once the order is ready. */
export const orderEmailCopy: Record<string, Copy | { pickup: Copy; delivery: Copy }> = {
  ORDER_RECEIVED: {
    subject: "We’ve got your order",
    title: "Your order is in!",
    body: "Thank you for choosing us. As soon as your payment goes through, we’ll put your order on the schedule.",
  },
  PAID: {
    subject: "Payment received, thank you!",
    title: "You’re all set",
    body: "Your payment came through. We’ll confirm your order shortly and let you know when it’s in the oven.",
  },
  CONFIRMED: {
    subject: "Your order is confirmed",
    title: "It’s on our schedule",
    body: "We’ve confirmed your order and set aside time in the kitchen for it.",
  },
  PREPARING: {
    subject: "Your order is in the kitchen",
    title: "We’re baking for you",
    body: "Your order is being made right now, by hand and with care.",
  },
  READY: {
    pickup: {
      subject: "Your order is ready to collect",
      title: "Ready when you are",
      body: "Your order is boxed up and waiting for you. Pop by during pickup hours.",
    },
    delivery: {
      subject: "Your order is packed",
      title: "All packed up",
      body: "Your order is packed and will be heading your way soon.",
    },
  },
  OUT_FOR_DELIVERY: {
    subject: "Your order is on its way",
    title: "On its way to you",
    body: "Your order has left our kitchen. Keep an eye out, it won’t be long!",
  },
  DELIVERED: {
    pickup: {
      subject: "Enjoy every bite",
      title: "Enjoy every bite",
      body: "Thank you for picking up your order. We hope it brings a smile to your table.",
    },
    delivery: {
      subject: "Your order has arrived",
      title: "Delivered. Enjoy!",
      body: "Your order has arrived. We hope it brings a smile to your table.",
    },
  },
  REFUNDED: {
    subject: "Your refund is on its way",
    title: "Your refund is on its way",
    body: "We’ve refunded your payment in full. It can take a few business days to show in your account.",
  },
  PARTIALLY_REFUNDED: {
    subject: "We’ve sent you a refund",
    title: "A refund is on its way",
    body: "We’ve refunded part of your payment. It can take a few business days to show in your account.",
  },
};

export function orderCopy(event: string, fulfilment: "pickup" | "delivery") {
  const copy = orderEmailCopy[event];
  if (!copy) return null;
  return "subject" in copy ? copy : copy[fulfilment];
}

// Where each update sits on the customer's journey; refunds show no tracker.
const stepsFor = (fulfilment: "pickup" | "delivery") =>
  fulfilment === "pickup"
    ? ["Ordered", "Paid", "Baking", "Ready", "Collected"]
    : ["Ordered", "Paid", "Baking", "Ready", "On its way", "Delivered"];
const position: Record<string, number> = {
  ORDER_RECEIVED: 0,
  PAID: 1,
  CONFIRMED: 1,
  PREPARING: 2,
  READY: 3,
  OUT_FOR_DELIVERY: 4,
  DELIVERED: 99,
};

export type OrderEmailData = {
  event: string;
  customerName: string;
  orderNumber: string;
  fulfilment: "pickup" | "delivery";
  items: { name: string; detail: string; quantity: number; total: number }[];
  totals: { subtotal: number; discount: number; delivery: number; tax: number; total: number };
  currency: string;
  locale: string;
  deliveryAddress?: string;
  pickup?: { address: string; hours: string; instructions: string };
  trackUrl: string;
  receiptUrl?: string;
  whatsappUrl?: string;
  /** For refund emails: this refund, everything refunded so far, and what was paid. */
  refund?: { amount: number; refundedTotal: number; paid: number };
  businessName: string;
  accent?: string;
  footer?: string;
};

function tracker(t: Translate, data: OrderEmailData, accent: string) {
  const steps = stepsFor(data.fulfilment);
  const at = Math.min(position[data.event] ?? -1, steps.length - 1);
  if (at < 0) return "";
  const cells = steps
    .map((step, index) => {
      const reached = index <= at;
      return `<td align="center" style="padding:0 2px;font-size:12px;line-height:1.3;color:${reached ? "#241b1e" : "#a39a96"};font-weight:${index === at ? 700 : 500}"><div style="height:6px;border-radius:6px;margin-bottom:8px;background:${reached ? accent : "#eee6e1"}"></div>${escapeHtml(t(step))}</td>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;table-layout:fixed"><tr>${cells}</tr></table>`;
}

function summary(t: Translate, data: OrderEmailData) {
  const money = (value: number) => escapeHtml(formatMoney(value, data.currency, data.locale));
  const rows = data.items
    .map(
      (item) =>
        `<tr><td style="padding:12px 0;border-bottom:1px solid #f0e9e4;vertical-align:top"><b>${escapeHtml(item.name)}</b><br><span style="color:#6e6669;font-size:14px">${escapeHtml(item.detail)} × ${item.quantity}</span></td><td align="right" style="padding:12px 0;border-bottom:1px solid #f0e9e4;vertical-align:top;white-space:nowrap">${money(item.total)}</td></tr>`,
    )
    .join("");
  const line = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:4px 0;${strong ? "font-weight:700;font-size:17px;padding-top:10px" : "color:#6e6669"}">${escapeHtml(label)}</td><td align="right" style="padding:4px 0;${strong ? "font-weight:700;font-size:17px;padding-top:10px" : "color:#6e6669"}">${value}</td></tr>`;
  const totals = [
    line(t("Subtotal"), money(data.totals.subtotal)),
    data.totals.discount ? line(t("Discount"), `−${money(data.totals.discount)}`) : "",
    data.fulfilment === "delivery"
      ? line(t("Delivery"), data.totals.delivery ? money(data.totals.delivery) : t("Free"))
      : "",
    data.totals.tax ? line(t("Tax"), money(data.totals.tax)) : "",
    line(t("Total"), money(data.totals.total), true),
  ].join("");
  return `<h2 style="margin:28px 0 4px;font-size:17px">${escapeHtml(t("Order {number}", { number: data.orderNumber }))}</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px">${rows}${totals}</table>`;
}

function refundBlock(t: Translate, data: OrderEmailData) {
  const refund = data.refund;
  if (!refund) return "";
  const money = (value: number) => escapeHtml(formatMoney(value, data.currency, data.locale));
  const line = (label: string, value: string) =>
    `<tr><td style="padding:3px 0;font-size:14px;color:#4b4245">${escapeHtml(label)}</td><td align="right" style="padding:3px 0;font-size:14px;color:#4b4245">${value}</td></tr>`;
  const rows = [
    line(t("Refunded"), `<b style="color:#241b1e">${money(refund.amount)}</b>`),
    refund.refundedTotal !== refund.amount ? line(t("Refunded so far"), money(refund.refundedTotal)) : "",
    refund.refundedTotal < refund.paid ? line(t("You paid"), money(refund.paid)) : "",
  ].join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;padding:12px 18px;border-radius:14px;background:#faf6f2">${rows}</table>`;
}

function whereBlock(t: Translate, data: OrderEmailData) {
  const box = (heading: string, lines: string[]) =>
    `<div style="margin:24px 0 0;padding:16px 18px;border-radius:14px;background:#faf6f2"><b style="font-size:14px">${escapeHtml(heading)}</b><br>${lines
      .filter(Boolean)
      .map((value) => `<span style="font-size:14px;color:#4b4245">${escapeHtml(value)}</span>`)
      .join("<br>")}</div>`;
  if (data.fulfilment === "pickup" && data.pickup)
    return box(t("Pick up from"), [data.pickup.address, data.pickup.hours, data.pickup.instructions]);
  if (data.fulfilment === "delivery" && data.deliveryAddress) return box(t("Delivering to"), [data.deliveryAddress]);
  return "";
}

/** The customer's order update email, plus the matching push notification text. */
export function orderStatusEmail(t: Translate, data: OrderEmailData) {
  const copy = orderCopy(data.event, data.fulfilment);
  if (!copy) return null;
  const accent = data.accent && /^#[0-9a-f]{6}$/i.test(data.accent) ? data.accent : "#792f49";
  const firstName = data.customerName.trim().split(/\s+/)[0] || t("there");
  const body = [
    `<p style="margin:0 0 12px">${escapeHtml(t("Hi {name},", { name: firstName }))}</p>`,
    `<p style="margin:0">${escapeHtml(t(copy.body))}</p>`,
    refundBlock(t, data),
    tracker(t, data, accent),
    emailButton(data.trackUrl, t("Track your order"), accent),
    data.receiptUrl
      ? `<p style="margin:0;font-size:14px"><a href="${escapeHtml(data.receiptUrl)}" style="color:${accent}">${escapeHtml(t("View or download your receipt"))}</a></p>`
      : "",
    summary(t, data),
    whereBlock(t, data),
    `<p style="margin:28px 0 0">${escapeHtml(t("Thank you for letting us bake for you."))}<br><b>${escapeHtml(t("The {business} kitchen", { business: data.businessName }))}</b></p>`,
    data.whatsappUrl
      ? `<p style="margin:16px 0 0;font-size:14px;color:#6e6669">${escapeHtml(t("Questions?"))} <a href="${escapeHtml(data.whatsappUrl)}" style="color:${accent}">${escapeHtml(t("Message us on WhatsApp"))}</a></p>`
      : "",
  ].join("");
  return {
    subject: `${t(copy.subject)} · ${data.orderNumber}`,
    html: emailFrame(t(copy.title), body, {
      businessName: data.businessName,
      footer: data.footer,
      accent,
      preheader: t(copy.body),
    }),
    pushTitle: t(copy.title),
    pushBody: `${t(copy.body)} · ${data.orderNumber}`,
  };
}

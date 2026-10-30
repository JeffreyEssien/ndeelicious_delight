import { getCustomerEmailText } from "@/lib/customer-text";
import { whatsappUrl } from "@/lib/contact";
import { getBusinessSettings, getStoreAppearance, getStoreTheme } from "@/lib/data/settings";
import { orderCopy, orderStatusEmail } from "@/lib/email/order-email";
import { resolveThemeTokens } from "@/lib/theme/tokens";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailButton, emailFrame, escapeHtml, sendTransactionalEmail } from "@/lib/email/mailer";
import { formatMoney } from "@/lib/format";
import { sendEmailToActiveAdmins } from "@/lib/email/admin-recipients";
import { createAccessToken, issueOrderDocument, latestDocument } from "@/lib/documents/service";
import { getSiteUrl } from "@/lib/site-url";
import { pushToAdmins, pushToOrder } from "@/lib/push/send";

export async function queueOrderNotification(db: SupabaseClient, orderId: string, eventType: "ORDER_RECEIVED") {
  const { data: order, error: orderError } = await db.from("orders").select("email").eq("id", orderId).single();
  if (orderError) throw orderError;
  const { data, error } = await db
    .from("order_notifications")
    .upsert(
      { order_id: orderId, event_type: eventType, recipient: order.email },
      { onConflict: "order_id,event_type,recipient", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data?.id as string | undefined;
}

async function deliver(db: SupabaseClient, notificationId: string) {
  const leaseUntil = new Date(Date.now() + 5 * 60_000).toISOString();
  const { data: notification, error: claimError } = await db
    .from("order_notifications")
    .update({ status: "SENDING", next_attempt_at: leaseUntil, updated_at: new Date().toISOString() })
    .eq("id", notificationId)
    .in("status", ["PENDING", "FAILED", "SENDING"])
    .lte("next_attempt_at", new Date().toISOString())
    .select("id,order_id,event_type,recipient,attempts")
    .maybeSingle();
  if (claimError || !notification) return false;
  const { data: order, error: orderError } = await db
    .from("orders")
    .select(
      "order_number,customer_name,fulfilment,preparation_ready_at,delivery_address_snapshot,subtotal,discount_total,delivery_fee,tax_total,grand_total,currency,order_items(product_name,variant_name,quantity,final_price,product_snapshot)",
    )
    .eq("id", notification.order_id)
    .single();
  const fulfilment: "pickup" | "delivery" = order?.fulfilment === "pickup" ? "pickup" : "delivery";
  if (orderError || !order || !orderCopy(notification.event_type, fulfilment)) {
    await db
      .from("order_notifications")
      .update({ status: "FAILED", attempts: notification.attempts + 1, last_error: "invalid-notification-data" })
      .eq("id", notification.id);
    return false;
  }
  const { t, frame } = await getCustomerEmailText(db);
  const [business, theme, appearance] = await Promise.all([
    getBusinessSettings(db),
    getStoreTheme(db),
    getStoreAppearance(db),
  ]);
  let receiptUrl = "";
  let receiptDocumentId = "";
  if (notification.event_type === "PAID") {
    const existing = await latestDocument(db, "RECEIPT", "order_id", notification.order_id);
    const receipt = existing
      ? {
          document: existing,
          token: await createAccessToken(db, existing.id, new Date(Date.now() + 3650 * 86400000).toISOString()),
        }
      : await issueOrderDocument(db, order.order_number, "RECEIPT");
    receiptUrl = `${getSiteUrl()}/documents/orders/${encodeURIComponent(order.order_number)}/receipt?token=${receipt.token}`;
    receiptDocumentId = receipt.document.id;
  }
  let refund: { amount: number; refundedTotal: number; paid: number } | undefined;
  if (notification.event_type === "REFUNDED" || notification.event_type === "PARTIALLY_REFUNDED") {
    const [{ data: payment }, { data: latest }] = await Promise.all([
      db
        .from("payments")
        .select("amount,refunded_amount")
        .eq("order_id", notification.order_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("order_refunds")
        .select("amount")
        .eq("order_id", notification.order_id)
        .eq("status", "SUCCEEDED")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (payment && latest)
      refund = { amount: latest.amount, refundedTotal: payment.refunded_amount, paid: payment.amount };
  }
  const schedule = business.fulfilmentSchedule;
  const address = order.delivery_address_snapshot;
  const email = orderStatusEmail(t, {
    event: notification.event_type,
    customerName: order.customer_name,
    orderNumber: order.order_number,
    fulfilment,
    items: (order.order_items ?? []).map((item) => {
      const selections = (item.product_snapshot?.selections ?? []) as { group: string; value: string }[];
      return {
        name: item.product_name,
        detail: [item.variant_name ?? t("Standard"), ...selections.map((s) => `${s.group}: ${s.value}`)].join(" · "),
        quantity: item.quantity,
        total: item.final_price,
      };
    }),
    totals: {
      subtotal: order.subtotal,
      discount: order.discount_total,
      delivery: order.delivery_fee,
      tax: order.tax_total ?? 0,
      total: order.grand_total,
    },
    currency: order.currency,
    locale: business.locale,
    deliveryAddress: address
      ? [address.street, address.addressLine2, address.city, address.province, address.postalCode]
          .filter(Boolean)
          .join(", ")
      : undefined,
    pickup:
      fulfilment === "pickup"
        ? {
            address:
              schedule?.pickupAddress ||
              [business.address, business.city, business.province].filter(Boolean).join(", "),
            hours: business.openingHours || "",
            instructions: schedule?.pickupInstructions ?? "",
            readyFrom:
              notification.event_type === "EARLIER_PICKUP" && order.preparation_ready_at
                ? new Intl.DateTimeFormat(business.locale, {
                    timeZone: business.timezone,
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(order.preparation_ready_at))
                : undefined,
          }
        : undefined,
    trackUrl: `${getSiteUrl()}/track-order?order=${encodeURIComponent(order.order_number)}`,
    receiptUrl: receiptUrl || undefined,
    whatsappUrl: whatsappUrl(business.whatsapp) || undefined,
    refund,
    businessName: frame.businessName,
    footer: frame.footer,
    accent: resolveThemeTokens(theme, appearance).primary,
  });
  if (!email) return false;
  // Push goes out once per order event, alongside the first email attempt; email retries don't repeat it.
  if (notification.attempts === 0)
    await pushToOrder(db, notification.order_id, {
      title: email.pushTitle,
      body: email.pushBody,
      url: `/track-order?order=${encodeURIComponent(order.order_number)}`,
      tag: `order-${order.order_number}`,
    });
  const result = await sendTransactionalEmail({ to: notification.recipient, subject: email.subject, html: email.html });
  const now = new Date().toISOString();
  await db
    .from("order_notifications")
    .update(
      result.sent
        ? { status: "SENT", attempts: notification.attempts + 1, sent_at: now, last_error: null, updated_at: now }
        : {
            status: "FAILED",
            attempts: notification.attempts + 1,
            last_error: "detail" in result && result.detail ? `${result.reason}: ${result.detail}` : result.reason,
            next_attempt_at: new Date(Date.now() + 15 * 60_000).toISOString(),
            updated_at: now,
          },
    )
    .eq("id", notification.id);
  await db.from("order_events").insert({
    order_id: notification.order_id,
    event_type: result.sent ? "EMAIL_SENT" : "EMAIL_FAILED",
    metadata: { notificationId: notification.id, eventType: notification.event_type },
  });
  if (result.sent && receiptDocumentId)
    await db.from("document_events").insert({ document_id: receiptDocumentId, action: "RECEIPT_SENT" });
  return result.sent;
}

export async function deliverOrderNotification(db: SupabaseClient, notificationId: string) {
  return deliver(db, notificationId);
}

export async function deliverPendingOrderNotifications(db: SupabaseClient, orderNumber: string) {
  const { data: order } = await db.from("orders").select("id").eq("order_number", orderNumber).maybeSingle();
  if (!order) return;
  const { data } = await db
    .from("order_notifications")
    .select("id")
    .eq("order_id", order.id)
    .in("status", ["PENDING", "FAILED", "SENDING"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at");
  for (const notification of data ?? []) await deliver(db, notification.id);
}

/** Plain words for why an email could not be sent, from what the mail server said. */
export function emailFailureReason(lastError: string | null | undefined) {
  const error = lastError ?? "";
  if (error.startsWith("not-configured")) return "Email isn't set up on the website yet (the SMTP settings in Vercel).";
  if (/EAUTH|535|Username and Password/i.test(error))
    return "Gmail refused the login. The email password in Vercel needs updating.";
  if (/5\.4\.5|limit/i.test(error)) return "Gmail's daily sending limit was reached. Try again tomorrow.";
  if (error === "invalid-notification-data") return "This email couldn't be put together for this order.";
  return error
    ? `The mail server said: ${error.replace(/^provider-error:?\s*/, "") || "no reason given"}`
    : "No reason was given.";
}

/**
 * The admin's "Resend customer emails": sends any email that failed or is waiting, straight away,
 * or, when everything already went out, sends the customer's latest update again. Push
 * notifications are not repeated. Reports what happened so the admin isn't left guessing.
 */
export async function resendOrderEmails(db: SupabaseClient, orderNumber: string) {
  const { data: order } = await db.from("orders").select("id,email").eq("order_number", orderNumber).maybeSingle();
  if (!order) return { recipient: "", sent: 0, failed: [] as string[], nothing: true };
  const { data: rows } = await db
    .from("order_notifications")
    .select("id,status,created_at,next_attempt_at")
    .eq("order_id", order.id)
    .order("created_at", { ascending: false });
  const now = new Date().toISOString();
  // Leave an email that is being sent right now alone, so the customer never gets it twice.
  const all = (rows ?? []).filter(
    (row) => !(row.status === "SENDING" && Date.parse(row.next_attempt_at) > Date.parse(now)),
  );
  const waiting = all.filter((row) => row.status !== "SENT");
  const chosen = waiting.length ? waiting : all.slice(0, 1);
  if (!chosen.length) return { recipient: order.email as string, sent: 0, failed: [], nothing: true };
  await db
    .from("order_notifications")
    .update({ status: "PENDING", next_attempt_at: now, updated_at: now })
    .in(
      "id",
      chosen.map((row) => row.id),
    );
  let sent = 0;
  const failed: string[] = [];
  for (const row of [...chosen].reverse()) {
    if (await deliver(db, row.id)) sent += 1;
    else {
      const { data: after } = await db.from("order_notifications").select("last_error").eq("id", row.id).maybeSingle();
      failed.push(emailFailureReason(after?.last_error));
    }
  }
  return { recipient: order.email as string, sent, failed, nothing: false };
}

export async function sendPaidOrderAdminNotification(db: SupabaseClient, orderNumber: string) {
  const { data: order } = await db
    .from("orders")
    .select(
      "customer_name,order_number,fulfilment,grand_total,currency,order_items(product_name,variant_name,quantity)",
    )
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (!order) return;
  const business = await getBusinessSettings(db).catch(() => null);
  const total =
    typeof order.grand_total === "number"
      ? ` · ${formatMoney(order.grand_total, order.currency, business?.locale)}`
      : "";
  const summary = (order.order_items ?? [])
    .map(
      (item) =>
        `<li>${escapeHtml(item.product_name)} · ${escapeHtml(item.variant_name ?? "Standard")} × ${item.quantity}</li>`,
    )
    .join("");
  await pushToAdmins(db, {
    title: `Paid order ${order.order_number}`,
    body: `${order.customer_name} paid. Ready to confirm.`,
    url: `/admin/orders?detail=${encodeURIComponent(order.order_number)}`,
    tag: `admin-order-${order.order_number}`,
  });
  await sendEmailToActiveAdmins(db, {
    subject: `Paid order ${order.order_number}`,
    html: emailFrame(
      "New paid order",
      `<p style="margin:0">${escapeHtml(order.customer_name)} paid for <b>${escapeHtml(order.order_number)}</b>${escapeHtml(total)}${order.fulfilment ? ` · ${order.fulfilment === "pickup" ? "Pickup" : "Delivery"}` : ""}.</p><ul style="padding-left:20px">${summary}</ul>${emailButton(`${getSiteUrl()}/admin/orders?detail=${encodeURIComponent(order.order_number)}`, "Open order")}`,
      { businessName: business?.businessName, footer: "Confirm it from the Orders page when you’re ready." },
    ),
  });
}

export async function sendPlacedOrderAdminNotification(db: SupabaseClient, orderNumber: string) {
  const { data: order } = await db
    .from("orders")
    .select(
      "customer_name,email,order_number,grand_total,currency,fulfilment,order_items(product_name,variant_name,quantity)",
    )
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (!order) return;
  const summary = (order.order_items ?? [])
    .map(
      (item) =>
        `<li>${escapeHtml(item.product_name)} · ${escapeHtml(item.variant_name ?? "Standard")} × ${item.quantity}</li>`,
    )
    .join("");
  await sendEmailToActiveAdmins(db, {
    replyTo: order.email,
    subject: `New order ${order.order_number} · awaiting payment`,
    html: emailFrame(
      "A new order was placed",
      `<p>${escapeHtml(order.customer_name)} created order <b>${escapeHtml(order.order_number)}</b> for ${escapeHtml(order.fulfilment)}.</p><ul>${summary}</ul><p>Payment is still pending. You’ll receive another alert when Stripe confirms it.</p>`,
    ),
  });
}

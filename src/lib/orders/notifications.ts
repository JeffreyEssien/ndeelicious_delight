import type { SupabaseClient } from "@supabase/supabase-js";
import { emailFrame, escapeHtml, sendTransactionalEmail } from "@/lib/email/mailer";

const messages: Record<string, { subject: string; title: string; body: string }> = {
  ORDER_RECEIVED: {
    subject: "We received your order",
    title: "Your order has been received",
    body: "Complete payment to reserve your order. We’ll confirm it as soon as payment succeeds.",
  },
  PAID: {
    subject: "Payment confirmed",
    title: "Your payment is confirmed",
    body: "Your order is paid and is waiting for confirmation from the bakery.",
  },
  CONFIRMED: {
    subject: "Order confirmed",
    title: "Your order is confirmed",
    body: "The bakery has confirmed your order and will begin preparing it on schedule.",
  },
  PREPARING: {
    subject: "Your order is being prepared",
    title: "We’re preparing your order",
    body: "Your order is now in the kitchen and being made with care.",
  },
  READY: {
    subject: "Your order is ready",
    title: "Your order is ready",
    body: "Your order is ready for its next step. Please check the fulfilment details below.",
  },
  OUT_FOR_DELIVERY: {
    subject: "Your order is out for delivery",
    title: "Your order is on the way",
    body: "Your order has left the bakery and is out for delivery.",
  },
  DELIVERED: {
    subject: "Your order has been delivered",
    title: "Order delivered",
    body: "Your order has been marked as delivered. We hope you enjoy every bite.",
  },
  REFUNDED: {
    subject: "Your order was refunded",
    title: "Refund processed",
    body: "A full refund has been processed. Your bank may take several business days to display it.",
  },
};

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
      "order_number,customer_name,fulfilment,delivery_address_snapshot,order_items(product_name,variant_name,quantity)",
    )
    .eq("id", notification.order_id)
    .single();
  const message = messages[notification.event_type];
  if (orderError || !order || !message) {
    await db
      .from("order_notifications")
      .update({ status: "FAILED", attempts: notification.attempts + 1, last_error: "invalid-notification-data" })
      .eq("id", notification.id);
    return false;
  }
  const summary = (order.order_items ?? [])
    .map(
      (item) =>
        `<li>${escapeHtml(item.product_name)} · ${escapeHtml(item.variant_name ?? "Standard")} × ${item.quantity}</li>`,
    )
    .join("");
  const fulfilment =
    order.fulfilment === "pickup"
      ? "Bakery pickup"
      : escapeHtml(
          [
            order.delivery_address_snapshot?.street,
            order.delivery_address_snapshot?.city,
            order.delivery_address_snapshot?.province,
            order.delivery_address_snapshot?.postalCode,
          ]
            .filter(Boolean)
            .join(", "),
        );
  const result = await sendTransactionalEmail({
    to: notification.recipient,
    subject: `${message.subject} · ${order.order_number}`,
    html: emailFrame(
      message.title,
      `<p>Hello ${escapeHtml(order.customer_name)},</p><p>${escapeHtml(message.body)}</p><p><b>Order ${escapeHtml(order.order_number)}</b></p><ul>${summary}</ul><p>${fulfilment}</p>`,
    ),
  });
  const now = new Date().toISOString();
  await db
    .from("order_notifications")
    .update(
      result.sent
        ? { status: "SENT", attempts: notification.attempts + 1, sent_at: now, last_error: null, updated_at: now }
        : {
            status: "FAILED",
            attempts: notification.attempts + 1,
            last_error: result.reason,
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

export async function sendPaidOrderAdminNotification(db: SupabaseClient, orderNumber: string) {
  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  if (!adminEmail) return;
  const { data: order } = await db
    .from("orders")
    .select("customer_name,order_number,order_items(product_name,variant_name,quantity)")
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (!order) return;
  const summary = (order.order_items ?? [])
    .map(
      (item) =>
        `<li>${escapeHtml(item.product_name)} · ${escapeHtml(item.variant_name ?? "Standard")} × ${item.quantity}</li>`,
    )
    .join("");
  await sendTransactionalEmail({
    to: adminEmail,
    subject: `Paid order ${order.order_number}`,
    html: emailFrame(
      "A paid order is ready to confirm",
      `<p>${escapeHtml(order.customer_name)} paid for order <b>${escapeHtml(order.order_number)}</b>.</p><ul>${summary}</ul>`,
    ),
  });
}

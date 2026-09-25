import type { SupabaseClient } from "@supabase/supabase-js";
import { emailFrame, escapeHtml, sendTransactionalEmail } from "./mailer";
import { getActiveAdminEmails } from "./admin-recipients";
import { getBusinessSettings } from "@/lib/data/settings";
import { getSiteUrl } from "@/lib/site-url";
import { createReviewToken } from "@/lib/reviews/invitations";

function localClock(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${value.year}-${value.month}-${value.day}`, hour: Number(value.hour) };
}

export async function sendDailyLowStockDigest(db: SupabaseClient) {
  const business = await getBusinessSettings(db);
  const clock = localClock(business.timezone);
  if (clock.hour < 8) return { skipped: "before-local-8am", sent: 0 };

  const { data, error } = await db
    .from("products")
    .select("name,low_stock_threshold,track_inventory,product_variants(name,sku,stock_quantity,active)")
    .eq("track_inventory", true)
    .in("status", ["ACTIVE", "OUT_OF_STOCK"])
    .order("name");
  if (error) throw error;
  const low = (data ?? []).flatMap((product) =>
    (product.product_variants ?? [])
      .filter((variant) => variant.active && variant.stock_quantity <= product.low_stock_threshold)
      .map((variant) => ({
        product: product.name,
        option: variant.name,
        sku: variant.sku ?? "No SKU",
        quantity: variant.stock_quantity,
        threshold: product.low_stock_threshold,
      })),
  );
  if (!low.length) return { skipped: "no-low-stock", sent: 0 };

  const rows = low
    .map(
      (item) =>
        `<tr><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(item.product)} · ${escapeHtml(item.option)}</td><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(item.sku)}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right"><b>${item.quantity}</b> / alert at ${item.threshold}</td></tr>`,
    )
    .join("");
  let sent = 0;
  for (const recipient of await getActiveAdminEmails(db)) {
    let { data: delivery, error: deliveryError } = await db
      .from("admin_email_deliveries")
      .select("id,status,attempts")
      .eq("kind", "LOW_STOCK_DIGEST")
      .eq("recipient", recipient)
      .eq("reference_key", clock.date)
      .maybeSingle();
    if (deliveryError) throw deliveryError;
    if (!delivery) {
      const created = await db
        .from("admin_email_deliveries")
        .insert({ kind: "LOW_STOCK_DIGEST", recipient, reference_key: clock.date })
        .select("id,status,attempts")
        .single();
      delivery = created.data;
      deliveryError = created.error;
    }
    if (deliveryError) throw deliveryError;
    if (!delivery || delivery.status === "SENT") continue;
    const result = await sendTransactionalEmail({
      to: recipient,
      subject: `${low.length} stock item${low.length === 1 ? "" : "s"} need attention`,
      html: emailFrame(
        "Morning stock check",
        `<p>The following product options are at or below their alert level.</p><table style="width:100%;border-collapse:collapse"><thead><tr><th style="padding:8px;text-align:left">Product</th><th style="padding:8px;text-align:left">SKU</th><th style="padding:8px;text-align:right">On hand</th></tr></thead><tbody>${rows}</tbody></table><p><a href="${getSiteUrl()}/admin/inventory">Open inventory</a></p>`,
      ),
    });
    await db
      .from("admin_email_deliveries")
      .update({
        status: result.sent ? "SENT" : "FAILED",
        attempts: delivery.attempts + 1,
        sent_at: result.sent ? new Date().toISOString() : null,
        last_error: result.sent ? null : result.reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", delivery.id);
    if (result.sent) sent += 1;
  }
  return { sent, items: low.length };
}

export async function sendDueReviewInvitations(db: SupabaseClient) {
  const cutoff = new Date(Date.now() - 12 * 60 * 60_000).toISOString();
  const { data: orders, error } = await db
    .from("orders")
    .select("id,order_number,customer_id,customer_name,email,delivered_at,order_items(id,product_id,product_name)")
    .eq("status", "DELIVERED")
    .not("delivered_at", "is", null)
    .lte("delivered_at", cutoff)
    .order("delivered_at")
    .limit(100);
  if (error) throw error;
  let sent = 0;
  for (const order of orders ?? []) {
    const deliveredAt = new Date(order.delivered_at as string);
    const eligibleAt = new Date(deliveredAt.getTime() + 12 * 60 * 60_000).toISOString();
    const expiresAt = new Date(deliveredAt.getTime() + 90 * 86400_000).toISOString();
    for (const item of order.order_items ?? []) {
      if (!item.product_id) continue;
      await db.from("review_invitations").upsert(
        {
          order_id: order.id,
          order_item_id: item.id,
          product_id: item.product_id,
          customer_id: order.customer_id,
          recipient: order.email,
          eligible_at: eligibleAt,
          expires_at: expiresAt,
        },
        { onConflict: "order_item_id", ignoreDuplicates: true },
      );
    }
    const { data: invitations, error: invitationError } = await db
      .from("review_invitations")
      .select("id,order_item_id,attempts,order_items(product_name)")
      .eq("order_id", order.id)
      .is("sent_at", null)
      .is("used_at", null)
      .lte("eligible_at", new Date().toISOString());
    if (invitationError) throw invitationError;
    if (!invitations?.length) continue;
    const links = invitations
      .map((invitation) => {
        const item = Array.isArray(invitation.order_items) ? invitation.order_items[0] : invitation.order_items;
        const name = item?.product_name ?? "your purchase";
        const href = `${getSiteUrl()}/review/${createReviewToken(invitation.id)}`;
        return `<li style="margin:12px 0"><a href="${href}">Review ${escapeHtml(name)}</a></li>`;
      })
      .join("");
    const result = await sendTransactionalEmail({
      to: order.email,
      subject: `How was your order ${order.order_number}?`,
      html: emailFrame(
        "We’d love your feedback",
        `<p>Hi ${escapeHtml(order.customer_name)}, thank you for choosing us. These private links verify your purchase and can each be used once:</p><ul>${links}</ul><p>Your review will be checked before it appears publicly.</p>`,
      ),
    });
    const ids = invitations.map((invitation) => invitation.id);
    await db
      .from("review_invitations")
      .update({
        sent_at: result.sent ? new Date().toISOString() : null,
        attempts: Math.max(...invitations.map((invitation) => invitation.attempts)) + 1,
        last_error: result.sent ? null : result.reason,
        updated_at: new Date().toISOString(),
      })
      .in("id", ids);
    if (result.sent) sent += 1;
  }
  return { sent };
}

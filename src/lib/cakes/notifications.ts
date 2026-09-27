import type { SupabaseClient } from "@supabase/supabase-js";
import { createAccessToken } from "@/lib/documents/service";
import { emailFrame, escapeHtml, sendTransactionalEmail } from "@/lib/email/mailer";
import { formatMoney } from "@/lib/format";
import { getSiteUrl } from "@/lib/site-url";
import { getBusinessSettings } from "@/lib/data/settings";

export async function queueCakeQuoteEmail(db: SupabaseClient, cakeId: string, documentId: string) {
  const [{ data: cake, error: cakeError }, { data: document, error: documentError }] = await Promise.all([
    db.from("custom_cake_orders").select("id,email").eq("id", cakeId).maybeSingle(),
    db.from("business_documents").select("id,cake_order_id").eq("id", documentId).eq("kind", "QUOTE").maybeSingle(),
  ]);
  if (cakeError || documentError || !cake || !document || document.cake_order_id !== cake.id)
    throw new Error("QUOTE_NOT_FOUND");
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("document_deliveries")
    .upsert(
      {
        document_id: document.id,
        recipient: cake.email,
        status: "PENDING",
        next_attempt_at: now,
        lease_expires_at: null,
        last_error: null,
        updated_at: now,
      },
      { onConflict: "document_id,recipient" },
    )
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function deliverCakeQuoteEmail(db: SupabaseClient, deliveryId: string) {
  const now = new Date().toISOString();
  const { data: delivery, error: claimError } = await db
    .from("document_deliveries")
    .update({
      status: "SENDING",
      lease_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      updated_at: now,
    })
    .eq("id", deliveryId)
    .in("status", ["PENDING", "FAILED"])
    .lte("next_attempt_at", now)
    .select("id,document_id,recipient,attempts")
    .maybeSingle();
  if (claimError || !delivery) return false;

  const [{ data: document }, business] = await Promise.all([
    db
      .from("business_documents")
      .select("id,valid_until,cake_order_id,customer_snapshot,totals_snapshot")
      .eq("id", delivery.document_id)
      .eq("kind", "QUOTE")
      .maybeSingle(),
    getBusinessSettings(db),
  ]);
  if (!document?.valid_until || !document.cake_order_id || new Date(document.valid_until).getTime() <= Date.now()) {
    await markFailed(db, delivery, "quote-expired");
    return false;
  }
  const { data: cake } = await db
    .from("custom_cake_orders")
    .select("request_number")
    .eq("id", document.cake_order_id)
    .maybeSingle();
  const customer = document.customer_snapshot as { name?: string };
  const totals = document.totals_snapshot as { total?: number };
  if (!cake?.request_number || typeof totals.total !== "number") {
    await markFailed(db, delivery, "invalid-quote-data");
    return false;
  }
  const token = await createAccessToken(db, document.id, document.valid_until);
  const url = `${getSiteUrl()}/documents/cakes/${encodeURIComponent(cake.request_number)}/quote?token=${token}`;
  const result = await sendTransactionalEmail({
    to: delivery.recipient,
    subject: `Your cake quote ${cake.request_number}`,
    html: emailFrame(
      "Your custom cake quote is ready",
      `<p>Hi ${escapeHtml(customer.name ?? "there")}, your quote is <b>${escapeHtml(formatMoney(totals.total, business.currency, business.locale))}</b>.</p><p><a href="${url}">View and respond to your quote</a></p><p>This quote is valid until ${escapeHtml(new Date(document.valid_until).toLocaleDateString(business.locale, { timeZone: business.timezone }))}.</p>`,
    ),
  });
  if (!result.sent) {
    await markFailed(db, delivery, result.reason ?? "provider-error");
    return false;
  }
  const sentAt = new Date().toISOString();
  await db
    .from("document_deliveries")
    .update({
      status: "SENT",
      attempts: delivery.attempts + 1,
      sent_at: sentAt,
      last_error: null,
      lease_expires_at: null,
      updated_at: sentAt,
    })
    .eq("id", delivery.id);
  await Promise.all([
    db.rpc("transition_business_document", {
      p_document_id: document.id,
      p_from_states: ["ISSUED", "SENT"],
      p_to_state: "SENT",
    }),
    db
      .from("custom_cake_orders")
      .update({ status: "QUOTE_SENT", updated_at: sentAt })
      .eq("id", document.cake_order_id)
      .is("order_id", null),
  ]);
  return true;
}

export async function deliverPendingCakeQuoteEmails(db: SupabaseClient) {
  const now = new Date().toISOString();
  await db
    .from("document_deliveries")
    .update({ status: "FAILED", last_error: "delivery-interrupted", lease_expires_at: null, updated_at: now })
    .eq("status", "SENDING")
    .lt("lease_expires_at", now);
  const { data, error } = await db
    .from("document_deliveries")
    .select("id")
    .in("status", ["PENDING", "FAILED"])
    .lte("next_attempt_at", now)
    .order("created_at")
    .limit(25);
  if (error) throw error;
  for (const delivery of data ?? []) await deliverCakeQuoteEmail(db, delivery.id);
}

async function markFailed(db: SupabaseClient, delivery: { id: string; attempts: number }, reason: string) {
  await db
    .from("document_deliveries")
    .update({
      status: "FAILED",
      attempts: delivery.attempts + 1,
      last_error: reason.slice(0, 200),
      next_attempt_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", delivery.id);
}

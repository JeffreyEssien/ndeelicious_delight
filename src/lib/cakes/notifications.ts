import type { SupabaseClient } from "@supabase/supabase-js";
import type { IssuedDocument } from "@/lib/documents/service";
import { emailFrame, escapeHtml, sendTransactionalEmail } from "@/lib/email/mailer";
import { formatMoney } from "@/lib/format";
import { getSiteUrl } from "@/lib/site-url";
import { getBusinessSettings } from "@/lib/data/settings";

export async function sendCakeQuoteEmail(db: SupabaseClient, id: string, issued: IssuedDocument) {
  const [{ data: cake }, business] = await Promise.all([
    db
      .from("custom_cake_orders")
      .select("request_number,customer_name,email,quoted_total,quote_expires_at")
      .eq("id", id)
      .maybeSingle(),
    getBusinessSettings(db),
  ]);
  if (!cake?.quoted_total) return;
  const url = `${getSiteUrl()}/documents/cakes/${encodeURIComponent(cake.request_number)}/quote?token=${issued.token}`;
  const result = await sendTransactionalEmail({
    to: cake.email,
    subject: `Your cake quote ${cake.request_number}`,
    html: emailFrame(
      "Your custom cake quote is ready",
      `<p>Hi ${escapeHtml(cake.customer_name)}, your quote is <b>${escapeHtml(formatMoney(cake.quoted_total, business.currency, business.locale))}</b>.</p><p><a href="${url}">View and respond to your quote</a></p><p>This quote is valid until ${escapeHtml(new Date(issued.document.valid_until ?? cake.quote_expires_at).toLocaleDateString(business.locale, { timeZone: business.timezone }))}.</p>`,
    ),
  });
  if (result.sent) {
    await db.rpc("transition_business_document", {
      p_document_id: issued.document.id,
      p_from_states: ["ISSUED", "SENT"],
      p_to_state: "SENT",
    });
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { createDocumentToken } from "@/lib/documents/tokens";
import { emailFrame, escapeHtml, sendTransactionalEmail } from "@/lib/email/mailer";
import { formatMoney } from "@/lib/format";
import { getSiteUrl } from "@/lib/site-url";
import { getBusinessSettings } from "@/lib/data/settings";

export async function sendCakeQuoteEmail(db: SupabaseClient, id: string) {
  const [{ data: cake }, business] = await Promise.all([
    db
      .from("custom_cake_orders")
      .select("request_number,customer_name,email,quoted_total,quote_expires_at")
      .eq("id", id)
      .maybeSingle(),
    getBusinessSettings(db),
  ]);
  if (!cake?.quoted_total) return;
  const token = createDocumentToken("quote", cake.request_number);
  const url = `${getSiteUrl()}/documents/cakes/${encodeURIComponent(cake.request_number)}/quote?token=${token}`;
  await sendTransactionalEmail({
    to: cake.email,
    subject: `Your cake quote ${cake.request_number}`,
    html: emailFrame(
      "Your custom cake quote is ready",
      `<p>Hi ${escapeHtml(cake.customer_name)}, your quote is <b>${escapeHtml(formatMoney(cake.quoted_total, business.currency, business.locale))}</b>.</p><p><a href="${url}">View, print or save your quote</a></p><p>This quote is valid until ${escapeHtml(new Date(cake.quote_expires_at).toLocaleDateString(business.locale, { timeZone: business.timezone }))}.</p>`,
    ),
  });
}

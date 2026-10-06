import { getCustomerEmailText } from "@/lib/customer-text";
import { z } from "zod";
import { requireAdminRequest } from "@/lib/auth/admin-request";
import { createAccessToken } from "@/lib/documents/service";
import { emailFrame, escapeHtml, sendTransactionalEmail } from "@/lib/email/mailer";
import { getSiteUrl } from "@/lib/site-url";

const schema = z.object({ action: z.enum(["link", "email"]) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Choose a valid document action." }, { status: 400 });
  const { id } = await params;
  const { data: document, error } = await auth.db
    .from("business_documents")
    .select(
      "id,kind,number,state,valid_until,customer_snapshot,order_id,cake_order_id,orders(order_number),custom_cake_orders(request_number)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !document) return Response.json({ error: "Document not found." }, { status: 404 });
  const order = Array.isArray(document.orders) ? document.orders[0] : document.orders;
  const cake = Array.isArray(document.custom_cake_orders)
    ? document.custom_cake_orders[0]
    : document.custom_cake_orders;
  const reference = document.kind === "QUOTE" ? cake?.request_number : order?.order_number;
  if (!reference) return Response.json({ error: "Document reference is unavailable." }, { status: 409 });
  const expiresAt =
    document.kind === "QUOTE"
      ? document.valid_until
      : new Date(Date.now() + (document.kind === "RECEIPT" ? 3650 : 30) * 86400000).toISOString();
  if (!expiresAt || new Date(expiresAt).getTime() <= Date.now())
    return Response.json({ error: "This document has expired and cannot be shared." }, { status: 409 });
  const token = await createAccessToken(auth.db, document.id, expiresAt);
  const path =
    document.kind === "QUOTE"
      ? `/documents/cakes/${encodeURIComponent(reference)}/quote`
      : `/documents/orders/${encodeURIComponent(reference)}/${document.kind.toLowerCase()}`;
  const url = `${getSiteUrl()}${path}?token=${token}`;
  if (parsed.data.action === "email") {
    const customer = document.customer_snapshot as { name?: string; email?: string };
    if (!customer.email) return Response.json({ error: "Customer email is unavailable." }, { status: 409 });
    const { t, frame } = await getCustomerEmailText(auth.db);
    const kind = t(document.kind === "RECEIPT" ? "Receipt" : document.kind === "INVOICE" ? "Invoice" : "Quote");
    const result = await sendTransactionalEmail({
      to: customer.email,
      subject: t("{kind} {number}", { kind, number: document.number }),
      html: emailFrame(
        t("Your {kind} is ready", { kind: kind.toLowerCase() }),
        `<p>${escapeHtml(t("Hi {name},", { name: customer.name ?? t("there") }))}</p><p><a href="${url}">${escapeHtml(t("View or download {number}", { number: document.number }))}</a></p>`,
        frame,
      ),
    });
    if (!result.sent) return Response.json({ error: "The email could not be sent." }, { status: 502 });
    if (document.kind !== "QUOTE")
      await auth.db.from("document_events").insert({
        document_id: document.id,
        action: document.kind === "RECEIPT" ? "RECEIPT_SENT" : "INVOICE_SENT",
        actor_admin_id: auth.admin.id,
      });
  }
  return Response.json({ url, emailed: parsed.data.action === "email" });
}

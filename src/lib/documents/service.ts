import type { SupabaseClient } from "@supabase/supabase-js";
import { getBusinessSettings, getStoreAppearance, getStoreTheme } from "@/lib/data/settings";
import { resolveThemeTokens } from "@/lib/theme/tokens";
import type { DocumentKind, PersistedDocument } from "./dto";
import { createDocumentAccessToken, hashDocumentToken } from "./tokens";

const DOCUMENT_SELECT =
  "id,order_id,cake_order_id,kind,number,revision,state,issued_at,valid_until,due_at,business_snapshot,customer_snapshot,line_items_snapshot,totals_snapshot,branding_snapshot,presentation_snapshot";

export type IssuedDocument = { document: PersistedDocument; token: string };

function addressLine(address: Record<string, string> | null) {
  if (!address) return undefined;
  return [address.street, address.addressLine2, address.city, address.province, address.postalCode]
    .filter(Boolean)
    .join(", ");
}

async function brandSnapshot(db: SupabaseClient) {
  const [business, appearance, theme] = await Promise.all([
    getBusinessSettings(db),
    getStoreAppearance(db),
    getStoreTheme(db),
  ]);
  const tokens = resolveThemeTokens(theme, appearance);
  return {
    business,
    branding: { accentColor: tokens.primary, logoUrl: "/WhatsApp Image 2026-09-15 at 22.16.43.jpeg" },
  };
}

function documentNumber(prefix: string, reference: string, revision: number) {
  const base = `${prefix}-${reference.replace(/^[A-Z]+-/, "")}`;
  return revision > 1 ? `${base}-R${revision}` : base;
}

async function nextRevision(
  db: SupabaseClient,
  kind: DocumentKind,
  foreignKey: "order_id" | "cake_order_id",
  id: string,
) {
  const { data, error } = await db
    .from("business_documents")
    .select("id,revision,state")
    .eq("kind", kind)
    .eq(foreignKey, id)
    .order("revision", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return {
    revision: (data?.revision ?? 0) + 1,
    previous: data as { id: string; revision: number; state: string } | null,
  };
}

export async function createAccessToken(db: SupabaseClient, documentId: string, expiresAt: string): Promise<string> {
  const generated = createDocumentAccessToken();
  const { error } = await db.from("document_access_tokens").insert({
    document_id: documentId,
    token_hash: generated.tokenHash,
    expires_at: expiresAt,
  });
  if (error) throw error;
  return generated.token;
}

export async function resolveAccessToken(db: SupabaseClient, token: string) {
  if (!token || token.length > 200) return null;
  const { data, error } = await db
    .from("document_access_tokens")
    .select(`document_id,expires_at,revoked_at,business_documents(${DOCUMENT_SELECT})`)
    .eq("token_hash", hashDocumentToken(token))
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data) return null;
  const joined = Array.isArray(data.business_documents) ? data.business_documents[0] : data.business_documents;
  return (joined ?? null) as PersistedDocument | null;
}

export async function issueOrderDocument(
  db: SupabaseClient,
  orderNumber: string,
  kind: Extract<DocumentKind, "INVOICE" | "RECEIPT">,
  createdBy?: string,
): Promise<IssuedDocument> {
  const { data: order, error } = await db
    .from("orders")
    .select(
      "id,order_number,customer_name,email,phone,status,fulfilment,delivery_address_snapshot,subtotal,discount_total,delivery_fee,tax_total,grand_total,created_at,customer_note,order_items(id,product_name,variant_name,sku,unit_price,quantity,final_price),payments(status,amount,refunded_amount,paid_at,created_at,provider_payload)",
    )
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (error) throw error;
  if (!order) throw new Error("ORDER_NOT_FOUND");
  const successful = (order.payments ?? []).filter((payment) =>
    ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(payment.status),
  );
  const paid = successful.reduce((sum, payment) => sum + payment.amount, 0);
  const refunded = successful.reduce((sum, payment) => sum + payment.refunded_amount, 0);
  if (kind === "RECEIPT" && paid <= 0) throw new Error("ORDER_NOT_PAID");

  const { revision, previous } = await nextRevision(db, kind, "order_id", order.id);
  const { business, branding } = await brandSnapshot(db);
  const issuedAt =
    kind === "RECEIPT"
      ? (successful
          .map((payment) => payment.paid_at ?? payment.created_at)
          .sort()
          .at(-1) ?? new Date().toISOString())
      : new Date().toISOString();
  const amountDue = Math.max(0, order.grand_total - paid + refunded);
  const dueAt = kind === "INVOICE" && amountDue > 0 ? new Date(Date.now() + 7 * 86400000).toISOString() : null;
  const values = {
    kind,
    number: documentNumber(kind === "RECEIPT" ? "RCT" : "INV", order.order_number, revision),
    order_id: order.id,
    revision,
    state: kind === "RECEIPT" ? "PAID" : "ISSUED",
    issued_at: issuedAt,
    due_at: dueAt,
    business_snapshot: business,
    customer_snapshot: {
      name: order.customer_name,
      email: order.email,
      phone: order.phone,
      address: addressLine(order.delivery_address_snapshot as Record<string, string> | null),
    },
    line_items_snapshot: (order.order_items ?? []).map((line) => ({
      id: line.id,
      name: line.product_name,
      detail: line.variant_name ?? "Standard",
      sku: line.sku ?? undefined,
      quantity: line.quantity,
      unitPrice: line.unit_price,
      total: line.final_price,
    })),
    totals_snapshot: {
      subtotal: order.subtotal,
      discount: order.discount_total,
      delivery: order.delivery_fee,
      tax: order.tax_total,
      total: order.grand_total,
      paid,
      refunded,
      amountDue,
    },
    branding_snapshot: branding,
    presentation_snapshot: {
      notes: [
        order.fulfilment === "pickup" ? "Fulfilment: Bakery pickup" : "Fulfilment: Delivery",
        ...(order.customer_note ? [`Customer note: ${order.customer_note}`] : []),
      ],
      design: "classic",
      showSku: true,
      showBusinessTaxNumber: true,
      showPaymentDetails: true,
      ...(kind === "INVOICE"
        ? {
            payNowUrl: (order.payments ?? [])
              .filter((payment) => payment.status === "PENDING")
              .map((payment) => payment.provider_payload?.checkout_url)
              .find((url): url is string => typeof url === "string"),
          }
        : {}),
    },
    supersedes_document_id: previous?.id ?? null,
    created_by: createdBy ?? null,
  };
  const { data, error: insertError } = await db
    .from("business_documents")
    .insert(values)
    .select(DOCUMENT_SELECT)
    .single();
  if (insertError) throw insertError;
  await db.from("document_events").insert({
    document_id: data.id,
    action: kind === "RECEIPT" ? "RECEIPT_ISSUED" : "INVOICE_ISSUED",
    actor_admin_id: createdBy ?? null,
  });
  if (previous) {
    await db.rpc("transition_business_document", {
      p_document_id: previous.id,
      p_from_states: [previous.state],
      p_to_state: "SUPERSEDED",
    });
    await db.rpc("revoke_document_tokens", { p_document_id: previous.id });
  }
  const expiresAt = new Date(Date.now() + (kind === "RECEIPT" ? 3650 : 30) * 86400000).toISOString();
  return { document: data as PersistedDocument, token: await createAccessToken(db, data.id, expiresAt) };
}

export async function issueCakeQuote(db: SupabaseClient, cakeId: string, createdBy?: string): Promise<IssuedDocument> {
  const { data: cake, error } = await db
    .from("custom_cake_orders")
    .select(
      "id,request_number,customer_name,email,phone,status,configuration,requested_date,quoted_total,quote_expires_at,customer_note",
    )
    .eq("id", cakeId)
    .maybeSingle();
  if (error) throw error;
  if (!cake?.quoted_total) throw new Error("QUOTE_NOT_READY");
  const { revision, previous } = await nextRevision(db, "QUOTE", "cake_order_id", cake.id);
  const { business, branding } = await brandSnapshot(db);
  const issuedAt = new Date();
  const validUntil = new Date(issuedAt.getTime() + 7 * 86400000).toISOString();
  const configuration = cake.configuration as Record<string, string>;
  const { data, error: insertError } = await db
    .from("business_documents")
    .insert({
      kind: "QUOTE",
      number: documentNumber("QT", cake.request_number, revision),
      cake_order_id: cake.id,
      revision,
      state: "ISSUED",
      issued_at: issuedAt.toISOString(),
      valid_until: validUntil,
      business_snapshot: business,
      customer_snapshot: { name: cake.customer_name, email: cake.email, phone: cake.phone },
      line_items_snapshot: [
        {
          id: cake.request_number,
          name: `${configuration.occasion || "Custom"} cake`,
          detail: [configuration.size, configuration.flavour, configuration.filling, configuration.design]
            .filter(Boolean)
            .join(" · "),
          quantity: 1,
          unitPrice: cake.quoted_total,
          total: cake.quoted_total,
        },
      ],
      totals_snapshot: { subtotal: cake.quoted_total, total: cake.quoted_total, amountDue: cake.quoted_total },
      branding_snapshot: branding,
      presentation_snapshot: {
        notes: [
          `Requested fulfilment date: ${cake.requested_date}`,
          ...(cake.customer_note ? [`Customer note: ${cake.customer_note}`] : []),
          "Final design details remain subject to written approval and availability.",
        ],
        design: "classic",
        showSku: false,
      },
      supersedes_document_id: previous?.id ?? null,
      created_by: createdBy ?? null,
    })
    .select(DOCUMENT_SELECT)
    .single();
  if (insertError) throw insertError;
  await db.from("document_events").insert({
    document_id: data.id,
    action: revision > 1 ? "QUOTE_REVISED" : "QUOTE_ISSUED",
    actor_admin_id: createdBy ?? null,
  });
  if (previous) {
    await db.rpc("transition_business_document", {
      p_document_id: previous.id,
      p_from_states: [previous.state],
      p_to_state: "SUPERSEDED",
    });
    await db.rpc("revoke_document_tokens", { p_document_id: previous.id });
  }
  await db
    .from("custom_cake_orders")
    .update({ status: "QUOTE_SENT", quote_expires_at: validUntil, updated_at: issuedAt.toISOString() })
    .eq("id", cake.id);
  return { document: data as PersistedDocument, token: await createAccessToken(db, data.id, validUntil) };
}

export async function latestDocument(
  db: SupabaseClient,
  kind: DocumentKind,
  foreignKey: "order_id" | "cake_order_id",
  id: string,
) {
  const { data, error } = await db
    .from("business_documents")
    .select(DOCUMENT_SELECT)
    .eq("kind", kind)
    .eq(foreignKey, id)
    .order("revision", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as PersistedDocument | null;
}

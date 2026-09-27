import type { BusinessDocumentData } from "@/components/documents/business-document";
import type { BusinessSettings } from "@/types/content";

export type DocumentKind = "QUOTE" | "INVOICE" | "RECEIPT";

export type PersistedDocument = {
  id: string;
  order_id: string | null;
  cake_order_id: string | null;
  kind: DocumentKind;
  number: string;
  revision: number;
  state: string;
  issued_at: string;
  valid_until: string | null;
  due_at: string | null;
  business_snapshot: BusinessSettings;
  customer_snapshot: BusinessDocumentData["customer"];
  line_items_snapshot: BusinessDocumentData["lines"];
  totals_snapshot: {
    subtotal: number;
    discount?: number;
    delivery?: number;
    tax?: number;
    total: number;
    paid?: number;
    refunded?: number;
    amountDue?: number;
  };
  branding_snapshot: { accentColor: string; logoUrl?: string };
  presentation_snapshot: {
    notes?: string[];
    footerMessage?: string;
    design?: "classic" | "modern" | "minimal";
    accentColor?: string;
    showSku?: boolean;
    showBusinessTaxNumber?: boolean;
    showPaymentDetails?: boolean;
    payNowUrl?: string;
  };
};

export type DocumentDTO = BusinessDocumentData & {
  id: string;
  revision: number;
  amountDue?: number;
  dueAt?: string | null;
};

export function persistedDocumentToDTO(document: PersistedDocument): DocumentDTO {
  const totals = document.totals_snapshot;
  const presentation = document.presentation_snapshot ?? {};
  return {
    id: document.id,
    revision: document.revision,
    kind: document.kind === "QUOTE" ? "Quote" : document.kind === "INVOICE" ? "Invoice" : "Receipt",
    number: document.number,
    issuedAt: document.issued_at,
    validUntil: document.valid_until,
    dueAt: document.due_at,
    status: document.state,
    customer: document.customer_snapshot,
    lines: document.line_items_snapshot,
    subtotal: totals.subtotal,
    discount: totals.discount,
    delivery: totals.delivery,
    tax: totals.tax,
    total: totals.total,
    paid: totals.paid,
    refunded: totals.refunded,
    amountDue: totals.amountDue,
    business: document.business_snapshot,
    accentColor: document.branding_snapshot.accentColor,
    logoUrl: document.branding_snapshot.logoUrl,
    ...presentation,
  };
}

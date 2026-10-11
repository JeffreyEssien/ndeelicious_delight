import type { BusinessDocumentData } from "@/components/documents/business-document";

export const documentPresentation = { pageWidth: 612, pageHeight: 792, margin: 44, font: "Noto Sans" } as const;
export function documentTaxLabel(document: BusinessDocumentData) {
  const business = document.business;
  return business.taxEnabled && business.taxRegistrationNumber && business.taxRateBps > 0
    ? `${business.taxLabel} (${business.taxRateBps / 100}%)`
    : business.taxLabel;
}
export function documentTotals(
  document: BusinessDocumentData,
): Array<{ label: string; value: number; emphasized?: boolean }> {
  return [
    { label: "Subtotal", value: document.subtotal },
    ...(document.discount ? [{ label: "Discount", value: -document.discount }] : []),
    ...(document.delivery ? [{ label: "Delivery", value: document.delivery }] : []),
    ...(document.tax ? [{ label: documentTaxLabel(document), value: document.tax }] : []),
    { label: document.kind === "Quote" ? "Estimated total" : "Total", value: document.total, emphasized: true },
    ...((document.showPaymentDetails ?? true) && document.kind !== "Quote" && document.paid !== undefined
      ? [{ label: "Paid", value: document.paid }]
      : []),
    ...((document.showPaymentDetails ?? true) && document.kind !== "Quote" && document.refunded
      ? [{ label: "Refunded", value: -document.refunded }]
      : []),
    ...(document.kind === "Invoice" && document.amountDue !== undefined
      ? [{ label: "Amount due", value: document.amountDue, emphasized: true }]
      : []),
  ];
}
export function documentMeaning(document: BusinessDocumentData) {
  if (document.kind === "Quote") return "Quotation for approval. Payment has not been received for this quotation.";
  if (document.kind === "Receipt")
    return "Confirmation of recorded payment. Refunds, when applicable, are shown separately.";
  return document.amountDue === 0 ? "Invoice — no outstanding balance." : "Invoice — payment due.";
}

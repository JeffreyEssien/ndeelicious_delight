import { formatDate, formatMoney } from "@/lib/format";
import type { DocumentDTO } from "./dto";
import { renderPaginatedDocumentPdf } from "./pdf-renderer";

export function documentTextLines(document: DocumentDTO) {
  const money = (value: number) => formatMoney(value, document.business.currency, document.business.locale);
  const taxLabel =
    document.business.taxEnabled && document.business.taxRegistrationNumber && document.business.taxRateBps > 0
      ? `${document.business.taxLabel} (${document.business.taxRateBps / 100}%)`
      : document.business.taxLabel;
  return [
    document.business.businessName,
    `${document.kind} ${document.number}`,
    `Status: ${document.status.replaceAll("_", " ")}`,
    `Issued: ${formatDate(document.issuedAt, document.business.locale, document.business.timezone)}`,
    document.validUntil
      ? `Valid until: ${formatDate(document.validUntil, document.business.locale, document.business.timezone)}`
      : "",
    document.dueAt ? `Due: ${formatDate(document.dueAt, document.business.locale, document.business.timezone)}` : "",
    `Customer: ${document.customer.name}`,
    document.customer.email,
    document.customer.phone ?? "",
    document.customer.address ?? "",
    "",
    ...document.lines.flatMap((line) => [
      `${line.quantity} x ${line.name}${line.sku ? ` [${line.sku}]` : ""}`,
      `  ${line.detail} - ${money(line.total)}`,
    ]),
    "",
    `Subtotal: ${money(document.subtotal)}`,
    document.discount ? `Discount: -${money(document.discount)}` : "",
    document.delivery ? `Delivery: ${money(document.delivery)}` : "",
    document.tax ? `${taxLabel}: ${money(document.tax)}` : "",
    `Total: ${money(document.total)}`,
    document.paid !== undefined ? `Paid: ${money(document.paid)}` : "",
    document.refunded ? `Refunded: -${money(document.refunded)}` : "",
    document.amountDue ? `Amount due: ${money(document.amountDue)}` : "",
    "",
    ...(document.notes ?? []),
    document.footerMessage ?? `Thank you for choosing ${document.business.businessName}.`,
  ].filter((line) => line !== "");
}

export function renderDocumentPdf(document: DocumentDTO) {
  return renderPaginatedDocumentPdf(document);
}

import { formatDate, formatMoney } from "@/lib/format";
import type { DocumentDTO } from "./dto";

function pdfText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replaceAll(/[^ -~]/g, "-");
}

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
  const lines = documentTextLines(document).slice(0, 48);
  const commands = ["BT", "/F1 11 Tf", "50 760 Td"];
  lines.forEach((line, index) => {
    if (index) commands.push("0 -15 Td");
    commands.push(`(${pdfText(line)}) Tj`);
  });
  commands.push("ET");
  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}

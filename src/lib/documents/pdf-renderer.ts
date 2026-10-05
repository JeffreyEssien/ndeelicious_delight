import { whatsappUrl } from "@/lib/contact";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { formatDate, formatMoney } from "@/lib/format";
import type { DocumentDTO } from "./dto";

type Logo = { bytes: Buffer; width: number; height: number };
type Page = { commands: string[]; y: number; link?: string };

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 44;

function pdfText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replaceAll("’", "'")
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .replaceAll(/[^ -~]/g, "-");
}

function rgb(hex: string | undefined) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!match) return [0.475, 0.184, 0.286] as const;
  return [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

function text(
  page: Page,
  value: string,
  x: number,
  y: number,
  size = 10,
  bold = false,
  color: readonly number[] = [0.13, 0.11, 0.1],
) {
  page.commands.push(
    `${color.map((item) => item.toFixed(3)).join(" ")} rg`,
    `BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfText(value)}) Tj ET`,
  );
}

function line(
  page: Page,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: readonly number[] = [0.88, 0.85, 0.82],
) {
  page.commands.push(`${color.join(" ")} RG 0.7 w ${x1} ${y1} m ${x2} ${y2} l S`);
}

function fill(page: Page, x: number, y: number, width: number, height: number, color: readonly number[]) {
  page.commands.push(`${color.map((item) => item.toFixed(3)).join(" ")} rg ${x} ${y} ${width} ${height} re f`);
}

function wrap(value: string, maximum: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) current = word;
    else if (`${current} ${word}`.length <= maximum) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function jpegDimensions(bytes: Buffer) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker))
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    if (length < 2) break;
    offset += length + 2;
  }
  return null;
}

function localLogo(logoUrl: string | undefined): Logo | undefined {
  for (const candidate of [logoUrl, "/brand-logo.jpg"]) {
    if (!candidate?.startsWith("/")) continue;
    try {
      const publicRoot = resolve(process.cwd(), "public");
      const pathname = decodeURIComponent(new URL(candidate, "https://local.invalid").pathname);
      const file = resolve(publicRoot, `.${pathname}`);
      if (!file.startsWith(`${publicRoot}${sep}`) || !/\.jpe?g$/i.test(file)) continue;
      const bytes = readFileSync(file);
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8) continue;
      const dimensions = jpegDimensions(bytes);
      if (dimensions) return { bytes, ...dimensions };
    } catch {
      // Try the canonical local brand asset if an older snapshot is unavailable.
    }
  }
  return undefined;
}

function tableHeader(page: Page, accent: readonly number[], design: DocumentDTO["design"]) {
  const minimal = design === "minimal";
  if (!minimal) fill(page, MARGIN, page.y - 5, PAGE_WIDTH - MARGIN * 2, 24, accent);
  else line(page, MARGIN, page.y - 5, PAGE_WIDTH - MARGIN, page.y - 5, accent);
  const color = minimal ? accent : [1, 1, 1];
  text(page, "DESCRIPTION", MARGIN + 8, page.y + 3, 8, true, color);
  text(page, "QTY", 367, page.y + 3, 8, true, color);
  text(page, "UNIT PRICE", 420, page.y + 3, 8, true, color);
  text(page, "AMOUNT", 520, page.y + 3, 8, true, color);
  page.y -= 18;
}

function header(
  page: Page,
  document: DocumentDTO,
  accent: readonly number[],
  logo: Logo | undefined,
  continuation: boolean,
) {
  const modern = document.design === "modern";
  fill(page, 0, 0, PAGE_WIDTH, PAGE_HEIGHT, [1, 1, 1]);
  if (modern) fill(page, 0, PAGE_HEIGHT - 82, PAGE_WIDTH, 82, accent);
  else if (document.design !== "minimal") fill(page, 0, PAGE_HEIGHT - 8, PAGE_WIDTH, 8, accent);
  if (logo) {
    const width = 74;
    const height = Math.min(42, width * (logo.height / logo.width));
    page.commands.push(`q ${width} 0 0 ${height} ${MARGIN} ${PAGE_HEIGHT - 66} cm /Im1 Do Q`);
  } else text(page, document.business.businessName, MARGIN, PAGE_HEIGHT - 52, 15, true, modern ? [1, 1, 1] : accent);
  text(
    page,
    `${document.kind.toUpperCase()} ${document.number}`,
    360,
    PAGE_HEIGHT - 42,
    14,
    true,
    modern ? [1, 1, 1] : accent,
  );
  text(
    page,
    continuation ? "Continued" : document.status.replaceAll("_", " "),
    360,
    PAGE_HEIGHT - 59,
    9,
    false,
    modern ? [1, 1, 1] : undefined,
  );
  if (!modern) line(page, MARGIN, PAGE_HEIGHT - 78, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 78, accent);
  page.y = PAGE_HEIGHT - 104;
}

export function renderPaginatedDocumentPdf(document: DocumentDTO) {
  const accent = rgb(document.accentColor);
  const logo = localLogo(document.logoUrl);
  const pages: Page[] = [];
  const addPage = (continuation: boolean) => {
    const page: Page = { commands: [], y: 0 };
    header(page, document, accent, logo, continuation);
    pages.push(page);
    return page;
  };
  let page = addPage(false);
  const money = (value: number) => formatMoney(value, document.business.currency, document.business.locale);

  text(page, "FROM", MARGIN, page.y, 8, true, accent);
  text(page, document.business.businessName, MARGIN, page.y - 17, 11, true);
  wrap(document.business.address, 43)
    .slice(0, 2)
    .forEach((value, index) => {
      text(page, value, MARGIN, page.y - 33 - index * 12, 9);
    });
  text(
    page,
    [document.business.contactEmail, document.business.phone].filter(Boolean).join(" · "),
    MARGIN,
    page.y - 58,
    8,
  );
  if ((document.showBusinessTaxNumber ?? true) && document.business.taxRegistrationNumber)
    text(page, `${document.business.taxLabel} no. ${document.business.taxRegistrationNumber}`, MARGIN, page.y - 70, 8);
  text(page, "PREPARED FOR", 322, page.y, 8, true, accent);
  text(page, document.customer.name, 322, page.y - 17, 11, true);
  text(page, document.customer.email, 322, page.y - 33, 9);
  if (document.customer.phone) text(page, document.customer.phone, 322, page.y - 45, 9);
  if (document.customer.address)
    wrap(document.customer.address, 42)
      .slice(0, 2)
      .forEach((value, index) => {
        text(page, value, 322, page.y - 58 - index * 11, 8);
      });
  page.y -= 92;

  text(
    page,
    `Issued ${formatDate(document.issuedAt, document.business.locale, document.business.timezone)}`,
    MARGIN,
    page.y,
    9,
  );
  if (document.validUntil)
    text(
      page,
      `Valid until ${formatDate(document.validUntil, document.business.locale, document.business.timezone)}`,
      230,
      page.y,
      9,
    );
  if (document.dueAt)
    text(
      page,
      `Due ${formatDate(document.dueAt, document.business.locale, document.business.timezone)}`,
      390,
      page.y,
      9,
    );
  page.y -= 38;
  tableHeader(page, accent, document.design);

  for (const item of document.lines) {
    const details = [item.detail, (document.showSku ?? true) && item.sku ? `SKU ${item.sku}` : ""]
      .filter(Boolean)
      .join(" · ");
    const nameLines = wrap(item.name, 45);
    const detailLines = wrap(details, 52);
    const rowHeight = Math.max(44, 20 + (nameLines.length + detailLines.length) * 11);
    if (page.y - rowHeight < 145) {
      page = addPage(true);
      tableHeader(page, accent, document.design);
    }
    nameLines.forEach((value, index) => {
      text(page, value, MARGIN + 8, page.y - 15 - index * 11, 10, true);
    });
    detailLines.forEach((value, index) => {
      text(page, value, MARGIN + 8, page.y - 17 - nameLines.length * 11 - index * 10, 8, false, [0.4, 0.37, 0.35]);
    });
    text(page, String(item.quantity), 373, page.y - 15, 9);
    text(page, money(item.unitPrice), 420, page.y - 15, 9);
    text(page, money(item.total), 514, page.y - 15, 9, true);
    line(page, MARGIN, page.y - rowHeight, PAGE_WIDTH - MARGIN, page.y - rowHeight);
    page.y -= rowHeight;
  }

  const totals: Array<[string, number, boolean]> = [
    ["Subtotal", document.subtotal, false],
    ...(document.discount ? [["Discount", -document.discount, false] as [string, number, boolean]] : []),
    ...(document.delivery ? [["Delivery", document.delivery, false] as [string, number, boolean]] : []),
    ...(document.tax ? [[document.business.taxLabel, document.tax, false] as [string, number, boolean]] : []),
    ["Total", document.total, true],
    ...((document.showPaymentDetails ?? true) && document.paid !== undefined
      ? [["Paid", document.paid, false] as [string, number, boolean]]
      : []),
    ...((document.showPaymentDetails ?? true) && document.refunded
      ? [["Refunded", -document.refunded, false] as [string, number, boolean]]
      : []),
    ...(document.amountDue ? [["Amount due", document.amountDue, true] as [string, number, boolean]] : []),
  ];
  const noteLines = [
    ...(document.notes ?? []),
    document.footerMessage || `Thank you for choosing ${document.business.businessName}.`,
  ].flatMap((value) => wrap(value, 72));
  const required = Math.max(totals.length * 17 + 34, noteLines.length * 12 + 34);
  if (page.y - required < 70) page = addPage(true);
  const summaryTop = page.y - 18;
  text(page, "NOTES", MARGIN, summaryTop, 8, true, accent);
  noteLines.forEach((value, index) => {
    text(page, value, MARGIN, summaryTop - 17 - index * 12, 9);
  });
  totals.forEach(([label, value, bold], index) => {
    const y = summaryTop - index * 17;
    text(page, label, 395, y, bold ? 10 : 9, bold);
    text(
      page,
      value < 0 ? `-${money(Math.abs(value))}` : money(value),
      500,
      y,
      bold ? 10 : 9,
      bold,
      bold ? accent : undefined,
    );
    if (bold) line(page, 390, y + 13, PAGE_WIDTH - MARGIN, y + 13, accent);
  });

  pages.forEach((current, index) => {
    line(current, MARGIN, 40, PAGE_WIDTH - MARGIN, 40);
    text(current, document.business.businessName, MARGIN, 24, 8, false, [0.45, 0.42, 0.4]);
    const whatsapp = whatsappUrl(document.business.whatsapp);
    if (whatsapp) {
      text(current, "Chat with us on WhatsApp", 250, 24, 8, true, accent);
      current.link = whatsapp;
    }
    text(current, `Page ${index + 1} of ${pages.length}`, PAGE_WIDTH - 94, 24, 8, false, [0.45, 0.42, 0.4]);
  });
  return buildPdf(pages, logo);
}

function streamObject(bytes: Buffer) {
  return Buffer.concat([Buffer.from(`<< /Length ${bytes.length} >>\nstream\n`), bytes, Buffer.from("\nendstream")]);
}

function buildPdf(pages: Page[], logo: Logo | undefined) {
  const baseCount = logo ? 5 : 4;
  const pageNumbers = pages.map((_, index) => baseCount + 1 + index * 2);
  const objects: Buffer[] = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from(
      `<< /Type /Pages /Kids [${pageNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    ),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"),
  ];
  if (logo)
    objects.push(
      Buffer.concat([
        Buffer.from(
          `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.bytes.length} >>\nstream\n`,
        ),
        logo.bytes,
        Buffer.from("\nendstream"),
      ]),
    );
  pages.forEach((page, index) => {
    const pageNumber = pageNumbers[index];
    const contentNumber = pageNumber + 1;
    const resources = `/Font << /F1 3 0 R /F2 4 0 R >>${logo ? " /XObject << /Im1 5 0 R >>" : ""}`;
    objects.push(
      Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << ${resources} >> /Contents ${contentNumber} 0 R ${page.link ? `/Annots [<< /Type /Annot /Subtype /Link /Rect [248 20 370 34] /Border [0 0 0] /A << /S /URI /URI (${pdfText(page.link)}) >> >>]` : ""} >>`,
      ),
      streamObject(Buffer.from(page.commands.join("\n"))),
    );
  });

  const chunks: Uint8Array[] = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "binary")];
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    chunks.push(Buffer.from(`${index + 1} 0 obj\n`), object, Buffer.from("\nendobj\n"));
  });
  const xref = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`));
  chunks.push(
    Buffer.from(
      offsets
        .slice(1)
        .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
        .join(""),
    ),
  );
  chunks.push(Buffer.from(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  return Buffer.concat(chunks);
}

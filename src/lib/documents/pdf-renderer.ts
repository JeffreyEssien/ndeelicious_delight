import { documentLogoUrl } from "./branding";
import PDFDocument from "pdfkit";
import { create } from "fontkit";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { customerText } from "@/content/customer-text";
import { whatsappUrl } from "@/lib/contact";
import { formatDate, formatMoney } from "@/lib/format";
import type { DocumentDTO } from "./dto";
import { documentMeaning, documentPresentation, documentTotals } from "./presentation";

const { pageWidth: width, pageHeight: height, margin } = documentPresentation;
const right = width - margin;
const bottom = height - 62;
const fonts = {
  regular: readFileSync(resolve(process.cwd(), "public/fonts/NotoSans-Regular.ttf")),
  bold: readFileSync(resolve(process.cwd(), "public/fonts/NotoSans-Bold.ttf")),
};
const glyphFont = create(fonts.regular);
function validateText(value: string) {
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    if (/\s/.test(character)) continue;
    if (!("hasGlyphForCodePoint" in glyphFont) || !glyphFont.hasGlyphForCodePoint(point))
      throw new Error(
        `PDF font does not support U+${point.toString(16).toUpperCase()}. Use the HTML print view for this document.`,
      );
  }
  return value;
}
async function localLogo(url?: string) {
  const normalized = documentLogoUrl(url);
  if (normalized.startsWith("https://")) {
    try {
      const response = await fetch(normalized, { redirect: "error", signal: AbortSignal.timeout(5000) });
      if (!response.ok || !/^image\/(png|jpeg)(;|$)/i.test(response.headers.get("content-type") ?? ""))
        throw new Error("Unsupported logo");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Missing logo");
      const chunks: Buffer[] = [];
      let length = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.length;
        if (length > 2 * 1024 * 1024) {
          await reader.cancel();
          throw new Error("Logo too large");
        }
        chunks.push(Buffer.from(chunk.value));
      }
      return Buffer.concat(chunks);
    } catch {
      /* Match the HTML image-error fallback. */
    }
  }
  const root = resolve(process.cwd(), "public");
  for (const candidate of [normalized, "/brand-logo.jpg"]) {
    if (!candidate?.startsWith("/")) continue;
    try {
      const path = resolve(root, `.${decodeURIComponent(new URL(candidate, "https://local.invalid").pathname)}`);
      if (!path.startsWith(`${root}${sep}`) || !/\.(png|jpe?g)$/i.test(path)) continue;
      return readFileSync(path);
    } catch {
      /* An unavailable historical logo falls back to business identity. */
    }
  }
}
export async function renderPaginatedDocumentPdf(document: DocumentDTO): Promise<Buffer> {
  const pdf = new PDFDocument({
    size: "LETTER",
    margins: { top: margin, bottom: margin, left: margin, right: margin },
    bufferPages: true,
    info: { Title: `${document.kind} ${document.number}`, Author: document.business.businessName },
  });
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolveOutput, reject) => {
    pdf.on("data", (chunk) => chunks.push(chunk));
    pdf.on("end", () => resolveOutput(Buffer.concat(chunks)));
    pdf.on("error", reject);
  });
  pdf.registerFont("regular", fonts.regular);
  pdf.registerFont("bold", fonts.bold);
  const accent = /^#[a-f\d]{6}$/i.test(document.accentColor || "") ? (document.accentColor as string) : "#792f49";
  const t = customerText(document.customerText ?? {}, "business document");
  const money = (value: number) => formatMoney(value, document.business.currency, document.business.locale);
  const logo = await localLogo(document.logoUrl);
  let y: number = margin;
  const font = (bold = false, size = 10) => pdf.font(bold ? "bold" : "regular").fontSize(size);
  const write = (
    value: string,
    x: number,
    at: number,
    maxWidth: number,
    bold = false,
    size = 10,
    align: "left" | "right" = "left",
    color = "#282220",
  ) => {
    font(bold, size).fillColor(color).text(validateText(value), x, at, { width: maxWidth, align, lineBreak: false });
  };
  const lines = (value: string, maxWidth: number, bold = false, size = 10) => {
    font(bold, size);
    const result: string[] = [];
    // Measure glyph widths, including long unbroken addresses, rather than a character-count heuristic.
    for (const paragraph of value.split(/\r?\n/)) {
      let current = "";
      for (const character of paragraph) {
        if (current && pdf.widthOfString(current + character) > maxWidth) {
          const space = current.lastIndexOf(" ");
          if (space > current.length / 2) {
            result.push(current.slice(0, space));
            current = current.slice(space + 1) + character;
          } else {
            result.push(current);
            current = character;
          }
        } else current += character;
      }
      result.push(current);
    }
    return result;
  };
  function header(continued = false) {
    if (document.design === "modern") pdf.rect(0, 0, width, 7).fill(accent);
    if (logo) {
      try {
        pdf.image(logo, margin, 28, { fit: [104, 46] });
      } catch {
        write(document.business.businessName, margin, 34, 255, true, 14);
      }
    } else write(document.business.businessName, margin, 34, 255, true, 14);
    const title = `${t(document.kind).toUpperCase()} ${document.number}`;
    const titleLines = lines(title, 250, true, 15);
    titleLines.forEach((line, index) => {
      write(line, right - 250, 28 + index * 20, 250, true, 15, "right", accent);
    });
    const titleBottom = 28 + titleLines.length * 20;
    write(
      continued ? t("Continued") : t(document.status.replaceAll("_", " ")),
      right - 250,
      titleBottom + 4,
      250,
      false,
      9,
      "right",
    );
    y = Math.max(94, titleBottom + 30);
    pdf
      .moveTo(margin, y - 10)
      .lineTo(right, y - 10)
      .strokeColor("#ded8d4")
      .lineWidth(0.7)
      .stroke();
  }
  function nextPage(table = false) {
    pdf.addPage();
    header(true);
    if (table) tableHeader();
  }
  function ensure(space: number, table = false) {
    if (y + space > bottom) nextPage(table);
  }
  function block(value: string, bold = false, size = 10) {
    for (const line of lines(value, right - margin, bold, size)) {
      ensure(size + 8);
      write(line, margin, y, right - margin, bold, size);
      y += size + 5;
    }
  }
  function tableHeader() {
    ensure(34);
    if (document.design !== "minimal") pdf.rect(margin, y, right - margin, 27).fill("#f4f3f1");
    for (const [title, x, w, align] of [
      ["Description", margin + 8, 280, "left"],
      ["Qty", 340, 32, "right"],
      ["Unit price", 381, 76, "right"],
      ["Amount", 465, 95, "right"],
    ] as const)
      write(t(title), x, y + 7, w, true, 8, align);
    y += 34;
  }
  try {
    header();
    const customer = [
      t(document.kind === "Quote" ? "Prepared for" : "Bill to"),
      document.customer.name,
      document.customer.email,
      document.customer.phone,
      document.customer.address,
    ].filter(Boolean) as string[];
    const business = [
      t("From"),
      document.business.businessName,
      document.business.address,
      document.business.contactEmail,
      document.business.phone,
      ...((document.showBusinessTaxNumber ?? true) && document.business.taxRegistrationNumber
        ? [`${document.business.taxLabel} ${t("no. ")}${document.business.taxRegistrationNumber}`]
        : []),
    ].filter(Boolean);
    const partyLines = (values: string[]) =>
      values.flatMap((value, index) =>
        lines(value, 245, index === 1, index === 0 ? 8 : 10).map((line) => ({
          line,
          bold: index <= 1,
          size: index === 0 ? 8 : 10,
        })),
      );
    const left = partyLines(business);
    const rightParty = partyLines(customer);
    const partyHeight = Math.max(
      left.reduce((sum, line) => sum + line.size + 5, 0),
      rightParty.reduce((sum, line) => sum + line.size + 5, 0),
    );
    if (y + partyHeight < bottom - 40) {
      const top = y;
      for (const [party, x] of [
        [left, margin],
        [rightParty, 322],
      ] as const) {
        let at = top;
        for (const line of party) {
          write(line.line, x, at, 245, line.bold, line.size);
          at += line.size + 5;
        }
      }
      y += partyHeight;
    } else {
      for (const value of customer) block(value);
      y += 12;
      for (const value of business) block(value);
    }
    y += 12;
    block(
      `${t("Issued")}: ${formatDate(document.issuedAt, document.business.locale, document.business.timezone)} · ${t("Currency")}: ${document.business.currency}`,
      false,
      9,
    );
    if (document.validUntil)
      block(
        `${t("Valid until")}: ${formatDate(document.validUntil, document.business.locale, document.business.timezone)}`,
        false,
        9,
      );
    if (document.dueAt)
      block(
        `${t("Due")}: ${formatDate(document.dueAt, document.business.locale, document.business.timezone)}`,
        false,
        9,
      );
    block(t(documentMeaning(document)), false, 9);
    y += 12;
    tableHeader();
    for (const item of document.lines) {
      const description = lines(item.name, 280, true, 10);
      const detail = lines(
        [item.detail, (document.showSku ?? true) && item.sku ? `SKU ${item.sku}` : ""].filter(Boolean).join(" · "),
        280,
        false,
        9,
      );
      ensure(Math.min((description.length + detail.length) * 15 + 12, 80), true);
      let first = true;
      for (const [value, bold] of [
        ...description.map((line) => [line, true] as const),
        ...detail.map((line) => [line, false] as const),
      ]) {
        ensure(17, true);
        write(value, margin + 8, y, 280, bold, bold ? 10 : 9);
        if (first) {
          write(String(item.quantity), 340, y, 32, false, 9, "right");
          write(money(item.unitPrice), 381, y, 76, false, 9, "right");
          write(money(item.total), 465, y, 95, true, 9, "right");
          first = false;
        }
        y += 15;
      }
      y += 8;
      pdf.moveTo(margin, y).lineTo(right, y).strokeColor("#ded8d4").stroke();
      y += 10;
    }
    const totals = documentTotals(document);
    ensure(totals.length * 24 + 20);
    y += 8;
    for (const total of totals) {
      ensure(25);
      if (total.emphasized) pdf.rect(322, y - 4, right - 322, 25).fill("#f4f3f1");
      write(t(total.label), 330, y, 125, Boolean(total.emphasized), 10);
      write(
        total.value < 0 ? `-${money(-total.value)}` : money(total.value),
        465,
        y,
        95,
        Boolean(total.emphasized),
        10,
        "right",
        total.emphasized ? accent : "#282220",
      );
      y += 24;
    }
    y += 18;
    for (const note of document.notes ?? []) {
      block(note, false, 9);
      y += 6;
    }
    block(
      document.footerMessage || t("Thank you for choosing {value1}.", { value1: document.business.businessName }),
      false,
      9,
    );
    const range = pdf.bufferedPageRange();
    for (let page = 0; page < range.count; page++) {
      pdf.switchToPage(page);
      pdf
        .moveTo(margin, height - 45)
        .lineTo(right, height - 45)
        .strokeColor("#ded8d4")
        .stroke();
      write(document.business.businessName, margin, height - 33, 210, false, 8);
      const whatsapp = whatsappUrl(document.business.whatsapp);
      if (whatsapp) {
        const value = t("Chat with us on WhatsApp");
        write(value, 255, height - 33, 200, false, 8);
        pdf.link(255, height - 33, 150, 12, whatsapp);
      }
      write(
        t("Page {page} of {pages}", { page: page + 1, pages: range.count }),
        right - 95,
        height - 33,
        95,
        false,
        8,
        "right",
      );
    }
    pdf.end();
  } catch (error) {
    pdf.destroy();
    throw error;
  }
  return output;
}

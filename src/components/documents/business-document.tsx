"use client";
import { documentLogoUrl } from "@/lib/documents/branding";
import { useState } from "react";
import { documentMeaning, documentTotals } from "@/lib/documents/presentation";
import { useCustomerText } from "@/components/customer-text-provider";
import { whatsappUrl } from "@/lib/contact";
import { BrandLogo } from "@/components/layout/brand-logo";
import { formatDate, formatMoney } from "@/lib/format";
import type { BusinessSettings } from "@/types/content";
import { PrintDocumentButton } from "./print-document-button";

export type DocumentLine = {
  packQuantity?: number | null;
  tax?: import("@/features/tax/types").TaxLineSnapshot | null;
  id: string;
  name: string;
  detail: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  total: number;
};
export type BusinessDocumentData = {
  kind: "Invoice" | "Receipt" | "Quote";
  number: string;
  issuedAt: string;
  validUntil?: string | null;
  dueAt?: string | null;
  status: string;
  customer: { name: string; email: string; phone?: string; address?: string };
  lines: DocumentLine[];
  subtotal: number;
  discount?: number;
  delivery?: number;
  tax?: number;
  total: number;
  paid?: number;
  refunded?: number;
  amountDue?: number;
  notes?: string[];
  business: BusinessSettings;
  footerMessage?: string;
  design?: "classic" | "modern" | "minimal";
  accentColor?: string;
  logoUrl?: string;
  showSku?: boolean;
  showBusinessTaxNumber?: boolean;
  showPaymentDetails?: boolean;
  customized?: boolean;
  downloadHref?: string;
  payNowUrl?: string;
};

export function BusinessDocument({ showToolbar = true, ...props }: BusinessDocumentData & { showToolbar?: boolean }) {
  const t = useCustomerText("business document");
  const [logoFailed, setLogoFailed] = useState(false);

  const money = (value: number) => formatMoney(value, props.business.currency, props.business.locale);
  const style = { "--document-accent": props.accentColor ?? "var(--berry)" } as CSSProperties;
  return (
    <main className="business-document-wrap">
      {showToolbar && (
        <div className="document-toolbar no-print">
          <p>{t("This document is generated from the saved database record.")}</p>
          <div className="document-toolbar-actions">
            {props.downloadHref && (
              <a className="button button-secondary" href={props.downloadHref}>
                {t("Download PDF")}
              </a>
            )}
            <PrintDocumentButton />
          </div>
        </div>
      )}
      <article className={`business-document document-${props.design ?? "classic"}`} style={style}>
        <header>
          {props.logoUrl && !logoFailed ? (
            // biome-ignore lint/performance/noImgElement: stored document branding may use a historical local image.
            <img
              className="document-logo"
              src={documentLogoUrl(props.logoUrl)}
              alt={props.business.businessName}
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <BrandLogo />
          )}
          <div>
            <span>{t(props.kind)}</span>
            <h1>{props.number}</h1>
            <b>{t(props.status.replaceAll("_", " "))}</b>
          </div>
        </header>
        <section className="document-parties">
          <div>
            <span>{t("From")}</span>
            <b>{props.business.businessName}</b>
            <p>{props.business.address}</p>
            <p>{[props.business.contactEmail, props.business.phone].filter(Boolean).join(" · ")}</p>
            {(props.showBusinessTaxNumber ?? true) && props.business.taxRegistrationNumber && (
              <p>
                {props.business.taxLabel} {t("no. ")}
                {props.business.taxRegistrationNumber}
              </p>
            )}
          </div>
          <div>
            <span>{props.kind === "Quote" ? t("Prepared for") : t("Bill to")}</span>
            <b>{props.customer.name}</b>
            <p>{props.customer.email}</p>
            {props.customer.phone && <p>{props.customer.phone}</p>}
            {props.customer.address && <p>{props.customer.address}</p>}
          </div>
          <dl>
            <div>
              <dt>{t("Issued")}</dt>
              <dd>{formatDate(props.issuedAt, props.business.locale, props.business.timezone)}</dd>
            </div>
            {props.validUntil && (
              <div>
                <dt>{t("Valid until")}</dt>
                <dd>{formatDate(props.validUntil, props.business.locale, props.business.timezone)}</dd>
              </div>
            )}
            {props.dueAt && (
              <div>
                <dt>{t("Due")}</dt>
                <dd>{formatDate(props.dueAt, props.business.locale, props.business.timezone)}</dd>
              </div>
            )}
            <div>
              <dt>{t("Currency")}</dt>
              <dd>{props.business.currency}</dd>
            </div>
          </dl>
        </section>
        <p className="document-meaning">{t(documentMeaning(props))}</p>
        <table>
          <thead>
            <tr>
              <th>{t("Description")}</th>
              <th>{t("Qty")}</th>
              <th>{t("Unit price")}</th>
              <th>{t("Amount")}</th>
            </tr>
          </thead>
          <tbody>
            {props.lines.map((line) => (
              <tr key={line.id}>
                <td>
                  <b>{line.name}</b>
                  <small>
                    {line.detail}
                    {line.packQuantity ? ` · ${line.quantity} packs / ${line.quantity * line.packQuantity} pieces` : ""}
                    {(props.showSku ?? true) && line.sku ? t(" · SKU {value1}", { value1: line.sku }) : ""}
                  </small>
                </td>
                <td>{line.quantity}</td>
                <td>{money(line.unitPrice)}</td>
                <td>{money(line.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="document-summary">
          <div>
            {props.notes?.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
          <dl>
            {documentTotals(props).map((total) => (
              <div key={total.label} className={total.emphasized ? "document-total" : undefined}>
                <dt>{t(total.label)}</dt>
                <dd>{total.value < 0 ? `-${money(-total.value)}` : money(total.value)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <footer>
          {whatsappUrl(props.business.whatsapp) && (
            <p>
              <a href={whatsappUrl(props.business.whatsapp)}>{t("Chat with us on WhatsApp")}</a>
            </p>
          )}
          <p>{props.footerMessage || t("Thank you for choosing {value1}.", { value1: props.business.businessName })}</p>
          <small>
            {props.customized
              ? t("Customized printable copy. The permanent order and payment records are unchanged.")
              : t("Generated from the permanent order record. Keep this document for your records.")}
          </small>
          {props.kind === "Invoice" && props.amountDue && props.payNowUrl && (
            <p className="no-print">
              <a className="button button-primary" href={props.payNowUrl}>
                {t("Pay now")}
              </a>
            </p>
          )}
        </footer>
      </article>
    </main>
  );
}
import type { CSSProperties } from "react";

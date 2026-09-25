import { BrandLogo } from "@/components/layout/brand-logo";
import { formatDate, formatMoney } from "@/lib/format";
import type { BusinessSettings } from "@/types/content";
import { PrintDocumentButton } from "./print-document-button";

type Line = {
  id: string;
  name: string;
  detail: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  total: number;
};
type Props = {
  kind: "Invoice" | "Receipt" | "Quote";
  number: string;
  issuedAt: string;
  validUntil?: string | null;
  status: string;
  customer: { name: string; email: string; phone?: string; address?: string };
  lines: Line[];
  subtotal: number;
  discount?: number;
  delivery?: number;
  tax?: number;
  total: number;
  paid?: number;
  refunded?: number;
  notes?: string[];
  business: BusinessSettings;
};

export function BusinessDocument(props: Props) {
  const money = (value: number) => formatMoney(value, props.business.currency, props.business.locale);
  return (
    <main className="business-document-wrap">
      <div className="document-toolbar no-print">
        <p>This document is generated from the saved database record.</p>
        <PrintDocumentButton />
      </div>
      <article className="business-document">
        <header>
          <BrandLogo />
          <div>
            <span>{props.kind}</span>
            <h1>{props.number}</h1>
            <b>{props.status.replaceAll("_", " ")}</b>
          </div>
        </header>
        <section className="document-parties">
          <div>
            <span>From</span>
            <b>{props.business.businessName}</b>
            <p>{props.business.address}</p>
            <p>{[props.business.contactEmail, props.business.phone].filter(Boolean).join(" · ")}</p>
            {props.business.taxRegistrationNumber && (
              <p>
                {props.business.taxLabel} no. {props.business.taxRegistrationNumber}
              </p>
            )}
          </div>
          <div>
            <span>{props.kind === "Quote" ? "Prepared for" : "Bill to"}</span>
            <b>{props.customer.name}</b>
            <p>{props.customer.email}</p>
            {props.customer.phone && <p>{props.customer.phone}</p>}
            {props.customer.address && <p>{props.customer.address}</p>}
          </div>
          <dl>
            <div>
              <dt>Issued</dt>
              <dd>{formatDate(props.issuedAt, props.business.locale, props.business.timezone)}</dd>
            </div>
            {props.validUntil && (
              <div>
                <dt>Valid until</dt>
                <dd>{formatDate(props.validUntil, props.business.locale, props.business.timezone)}</dd>
              </div>
            )}
            <div>
              <dt>Currency</dt>
              <dd>{props.business.currency}</dd>
            </div>
          </dl>
        </section>
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit price</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {props.lines.map((line) => (
              <tr key={line.id}>
                <td>
                  <b>{line.name}</b>
                  <small>
                    {line.detail}
                    {line.sku ? ` · SKU ${line.sku}` : ""}
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
            <div>
              <dt>Subtotal</dt>
              <dd>{money(props.subtotal)}</dd>
            </div>
            {!!props.discount && (
              <div>
                <dt>Discount</dt>
                <dd>−{money(props.discount)}</dd>
              </div>
            )}
            {!!props.delivery && (
              <div>
                <dt>Delivery</dt>
                <dd>{money(props.delivery)}</dd>
              </div>
            )}
            {!!props.tax && (
              <div>
                <dt>{props.business.taxLabel}</dt>
                <dd>{money(props.tax)}</dd>
              </div>
            )}
            <div className="document-total">
              <dt>Total</dt>
              <dd>{money(props.total)}</dd>
            </div>
            {props.paid !== undefined && (
              <div>
                <dt>Paid</dt>
                <dd>{money(props.paid)}</dd>
              </div>
            )}
            {!!props.refunded && (
              <div>
                <dt>Refunded</dt>
                <dd>−{money(props.refunded)}</dd>
              </div>
            )}
          </dl>
        </div>
        <footer>
          <p>Thank you for choosing {props.business.businessName}.</p>
          <small>Generated from the permanent order record. Keep this document for your records.</small>
        </footer>
      </article>
    </main>
  );
}

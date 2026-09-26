"use client";

import { useMemo, useState } from "react";
import { BusinessDocument, type BusinessDocumentData } from "./business-document";
import { Button, Checkbox, Input, Select, Textarea } from "@/components/ui/primitives";

const toMajor = (value?: number) => ((value ?? 0) / 100).toFixed(2);
const toMinor = (value: string) => Math.round((Number(value) || 0) * 100);

export function DocumentComposer({ initial }: { initial: BusinessDocumentData }) {
  const [draft, setDraft] = useState(initial);
  const [customized, setCustomized] = useState(false);
  const [active, setActive] = useState<"details" | "customer" | "items" | "design">("details");
  const update = (value: Partial<BusinessDocumentData>) => {
    setCustomized(true);
    setDraft((current) => ({ ...current, ...value }));
  };
  const computed = useMemo(() => ({ ...draft, customized }), [customized, draft]);
  const setLine = (index: number, value: Partial<BusinessDocumentData["lines"][number]>) =>
    update({ lines: draft.lines.map((line, at) => (at === index ? { ...line, ...value } : line)) });
  const recalculate = () => {
    const subtotal = draft.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    const lines = draft.lines.map((line) => ({ ...line, total: line.quantity * line.unitPrice }));
    update({ lines, subtotal, total: subtotal - (draft.discount ?? 0) + (draft.delivery ?? 0) + (draft.tax ?? 0) });
  };
  return (
    <main className="document-studio">
      <aside className="document-editor no-print">
        <div className="document-editor-head">
          <span>Document studio</span>
          <h1>Edit and print</h1>
          <p>Changes here only affect this printable copy. The paid order and Stripe record stay unchanged.</p>
        </div>
        <nav aria-label="Document editing sections">
          {(["details", "customer", "items", "design"] as const).map((section) => (
            <button
              type="button"
              className={active === section ? "active" : ""}
              onClick={() => setActive(section)}
              key={section}
            >
              {section}
            </button>
          ))}
        </nav>
        <div className="document-editor-fields">
          {active === "details" && (
            <>
              <Select
                label="Document type"
                value={draft.kind}
                onChange={(e) => update({ kind: e.target.value as BusinessDocumentData["kind"] })}
              >
                <option>Receipt</option>
                <option>Invoice</option>
                <option>Quote</option>
              </Select>
              <Input
                label="Document number"
                value={draft.number}
                onChange={(e) => update({ number: e.target.value })}
              />
              <Input
                label="Issue date"
                type="datetime-local"
                value={draft.issuedAt.slice(0, 16)}
                onChange={(e) => update({ issuedAt: new Date(e.target.value).toISOString() })}
              />
              <Input label="Status shown" value={draft.status} onChange={(e) => update({ status: e.target.value })} />
              <Textarea
                label="Notes — one per line"
                rows={5}
                value={(draft.notes ?? []).join("\n")}
                onChange={(e) => update({ notes: e.target.value.split("\n").filter(Boolean) })}
              />
              <Textarea
                label="Footer message"
                rows={3}
                value={draft.footerMessage ?? ""}
                placeholder={`Thank you for choosing ${draft.business.businessName}.`}
                onChange={(e) => update({ footerMessage: e.target.value })}
              />
            </>
          )}
          {active === "customer" && (
            <>
              <Input
                label="Customer name"
                value={draft.customer.name}
                onChange={(e) => update({ customer: { ...draft.customer, name: e.target.value } })}
              />
              <Input
                label="Email"
                type="email"
                value={draft.customer.email}
                onChange={(e) => update({ customer: { ...draft.customer, email: e.target.value } })}
              />
              <Input
                label="Phone"
                value={draft.customer.phone ?? ""}
                onChange={(e) => update({ customer: { ...draft.customer, phone: e.target.value } })}
              />
              <Textarea
                label="Billing / delivery address"
                rows={4}
                value={draft.customer.address ?? ""}
                onChange={(e) => update({ customer: { ...draft.customer, address: e.target.value } })}
              />
            </>
          )}
          {active === "items" && (
            <>
              <div className="document-line-editor">
                {draft.lines.map((line, index) => (
                  <fieldset key={line.id}>
                    <legend>Item {index + 1}</legend>
                    <Input label="Name" value={line.name} onChange={(e) => setLine(index, { name: e.target.value })} />
                    <Input
                      label="Description"
                      value={line.detail}
                      onChange={(e) => setLine(index, { detail: e.target.value })}
                    />
                    <Input
                      label="SKU"
                      value={line.sku ?? ""}
                      onChange={(e) => setLine(index, { sku: e.target.value })}
                    />
                    <div className="document-number-row">
                      <Input
                        label="Quantity"
                        type="number"
                        min="1"
                        value={line.quantity}
                        onChange={(e) => setLine(index, { quantity: Number(e.target.value) })}
                      />
                      <Input
                        label="Unit price"
                        type="number"
                        min="0"
                        step="0.01"
                        value={toMajor(line.unitPrice)}
                        onChange={(e) => setLine(index, { unitPrice: toMinor(e.target.value) })}
                      />
                    </div>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => update({ lines: draft.lines.filter((_, at) => at !== index) })}
                    >
                      Remove item
                    </button>
                  </fieldset>
                ))}
                <Button
                  variant="secondary"
                  onClick={() =>
                    update({
                      lines: [
                        ...draft.lines,
                        {
                          id: crypto.randomUUID(),
                          name: "New item",
                          detail: "",
                          sku: "",
                          quantity: 1,
                          unitPrice: 0,
                          total: 0,
                        },
                      ],
                    })
                  }
                >
                  Add item
                </Button>
              </div>
              <div className="document-totals-editor">
                <Input
                  label="Subtotal"
                  type="number"
                  step="0.01"
                  value={toMajor(draft.subtotal)}
                  onChange={(e) => update({ subtotal: toMinor(e.target.value) })}
                />
                <Input
                  label="Discount"
                  type="number"
                  step="0.01"
                  value={toMajor(draft.discount)}
                  onChange={(e) => update({ discount: toMinor(e.target.value) })}
                />
                <Input
                  label="Delivery"
                  type="number"
                  step="0.01"
                  value={toMajor(draft.delivery)}
                  onChange={(e) => update({ delivery: toMinor(e.target.value) })}
                />
                <Input
                  label={draft.business.taxLabel}
                  type="number"
                  step="0.01"
                  value={toMajor(draft.tax)}
                  onChange={(e) => update({ tax: toMinor(e.target.value) })}
                />
                <Input
                  label="Amount paid"
                  type="number"
                  step="0.01"
                  value={toMajor(draft.paid)}
                  onChange={(e) => update({ paid: toMinor(e.target.value) })}
                />
                <Input
                  label="Document total"
                  type="number"
                  step="0.01"
                  value={toMajor(draft.total)}
                  onChange={(e) => update({ total: toMinor(e.target.value) })}
                />
                <Button variant="secondary" onClick={recalculate}>
                  Recalculate totals
                </Button>
              </div>
            </>
          )}
          {active === "design" && (
            <>
              <Select
                label="Document layout"
                value={draft.design ?? "classic"}
                onChange={(e) => update({ design: e.target.value as BusinessDocumentData["design"] })}
              >
                <option value="classic">Classic</option>
                <option value="modern">Modern</option>
                <option value="minimal">Minimal</option>
              </Select>
              <label className="field">
                <span>Accent colour</span>
                <input
                  type="color"
                  value={draft.accentColor ?? "#792f49"}
                  onChange={(e) => update({ accentColor: e.target.value })}
                />
              </label>
              <Checkbox
                label="Show item SKUs"
                checked={draft.showSku ?? true}
                onChange={(e) => update({ showSku: e.target.checked })}
              />
              <Checkbox
                label="Show business tax number"
                checked={draft.showBusinessTaxNumber ?? true}
                onChange={(e) => update({ showBusinessTaxNumber: e.target.checked })}
              />
              <Checkbox
                label="Show paid and refunded amounts"
                checked={draft.showPaymentDetails ?? true}
                onChange={(e) => update({ showPaymentDetails: e.target.checked })}
              />
            </>
          )}
        </div>
        <div className="document-editor-actions">
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(initial);
              setCustomized(false);
            }}
          >
            Reset from order
          </Button>
          <Button onClick={() => window.print()}>Print / save PDF</Button>
        </div>
      </aside>
      <section className="document-preview" aria-label="Document preview">
        <BusinessDocument {...computed} showToolbar={false} />
      </section>
    </main>
  );
}

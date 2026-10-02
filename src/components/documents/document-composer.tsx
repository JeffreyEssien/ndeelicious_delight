"use client";

import { useMemo, useState } from "react";
import { BusinessDocument } from "./business-document";
import { Button, Checkbox, Select, Textarea } from "@/components/ui/primitives";
import type { DocumentDTO } from "@/lib/documents/dto";

export function DocumentComposer({ initial }: { initial: DocumentDTO }) {
  const initialPresentation = {
    notes: initial.notes ?? [],
    footerMessage: initial.footerMessage ?? "",
    design: initial.design ?? ("classic" as const),
    accentColor: initial.accentColor ?? "#792f49",
    showSku: initial.showSku ?? true,
    showBusinessTaxNumber: initial.showBusinessTaxNumber ?? true,
    showPaymentDetails: initial.showPaymentDetails ?? true,
  };
  const [presentation, setPresentation] = useState(initialPresentation);
  const [savedPresentation, setSavedPresentation] = useState(initialPresentation);
  const [changed, setChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState<"link" | "email" | null>(null);
  const [shareState, setShareState] = useState("");
  const update = (value: Partial<typeof presentation>) => {
    setChanged(true);
    setPresentation((current) => ({ ...current, ...value }));
  };
  const computed = useMemo(() => ({ ...initial, ...presentation }), [initial, presentation]);
  async function save() {
    if (!changed || saving) return;
    setSaving(true);
    setShareState("");
    const response = await fetch(`/api/admin/documents/${initial.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ presentation }),
    });
    const payload = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) {
      setShareState(payload?.error ?? "Presentation changes could not be saved.");
      return;
    }
    setSavedPresentation(presentation);
    setChanged(false);
    setShareState("Presentation saved. Downloads and customer links now use this design.");
  }
  async function share(action: "link" | "email") {
    if (sharing) return;
    if (changed) {
      setShareState("Save the presentation before downloading or sharing this document.");
      return;
    }
    setSharing(action);
    setShareState("");
    const response = await fetch(`/api/admin/documents/${initial.id}/share`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const payload = await response.json().catch(() => null);
    setSharing(null);
    if (!response.ok) {
      setShareState(payload?.error ?? "The document could not be shared.");
      return;
    }
    if (action === "link") await navigator.clipboard.writeText(payload.url);
    setShareState(action === "link" ? "Secure link copied" : "Email sent");
  }
  return (
    <main className="document-studio">
      <aside className="document-editor no-print">
        <div className="document-editor-head">
          <span>Official {initial.kind.toLowerCase()}</span>
          <h1>Prepare for printing</h1>
          <p>Amounts, customer details, dates, and line items are locked to the permanent order and payment record.</p>
        </div>
        <div className="document-editor-fields">
          <fieldset className="document-integrity-summary">
            <legend>Locked financial details</legend>
            <b>{initial.number}</b>
            <span>{initial.customer.name}</span>
            <span>{initial.lines.length} item(s)</span>
            <span>Financial details locked</span>
          </fieldset>
          <details>
            <summary>Presentation options</summary>
            <div className="form-stack">
              <Select
                label="Document layout"
                value={presentation.design}
                onChange={(event) => update({ design: event.target.value as typeof presentation.design })}
              >
                <option value="classic">Classic</option>
                <option value="modern">Modern</option>
                <option value="minimal">Minimal</option>
              </Select>
              <label className="field">
                <span>Brand accent</span>
                <input
                  type="color"
                  value={presentation.accentColor}
                  onChange={(event) => update({ accentColor: event.target.value })}
                />
              </label>
              <Checkbox
                label="Show item SKUs"
                checked={presentation.showSku}
                onChange={(event) => update({ showSku: event.target.checked })}
              />
              <Checkbox
                label="Show business tax number"
                checked={presentation.showBusinessTaxNumber}
                onChange={(event) => update({ showBusinessTaxNumber: event.target.checked })}
              />
              <Checkbox
                label="Show paid and refunded amounts"
                checked={presentation.showPaymentDetails}
                onChange={(event) => update({ showPaymentDetails: event.target.checked })}
              />
              <Textarea
                label="Non-financial notes — one per line"
                rows={4}
                value={presentation.notes.join("\n")}
                onChange={(event) => update({ notes: event.target.value.split("\n").filter(Boolean) })}
              />
              <Textarea
                label="Footer message"
                rows={3}
                value={presentation.footerMessage}
                placeholder={`Thank you for choosing ${initial.business.businessName}.`}
                onChange={(event) => update({ footerMessage: event.target.value })}
              />
            </div>
          </details>
          <p className="document-save-state" role="status">
            {saving
              ? "Saving presentation…"
              : changed
                ? "Preview has unsaved presentation changes"
                : "Preview matches the saved document"}
          </p>
        </div>
        <div className="document-editor-actions">
          <Button
            variant="ghost"
            disabled={!changed}
            onClick={() => {
              setPresentation(savedPresentation);
              setChanged(false);
            }}
          >
            Reset presentation
          </Button>
          <Button disabled={!changed || saving} onClick={save}>
            {saving ? "Saving…" : "Save presentation"}
          </Button>
          <a
            className={`button button-secondary${changed ? " is-disabled" : ""}`}
            href={`/api/admin/documents/${initial.id}/pdf`}
            aria-disabled={changed}
            onClick={(event) => {
              if (changed) event.preventDefault();
            }}
          >
            Download PDF
          </a>
          <Button variant="secondary" disabled={!!sharing || changed} onClick={() => share("link")}>
            {sharing === "link" ? "Copying…" : "Copy secure link"}
          </Button>
          <Button variant="secondary" disabled={!!sharing || changed} onClick={() => share("email")}>
            {sharing === "email" ? "Sending…" : "Email customer"}
          </Button>
          <Button onClick={() => window.print()}>Print</Button>
        </div>
        {shareState && <p className="document-save-state">{shareState}</p>}
      </aside>
      <section className="document-preview" aria-label="Document preview">
        <BusinessDocument {...computed} showToolbar={false} />
      </section>
    </main>
  );
}

"use client";
import { useState } from "react";
import { Button } from "@/components/ui/primitives";
import { parseInventoryCsv, type InventoryImportRow } from "@/lib/data/inventory-csv";
export function InventoryBulk({ onSaved }: { onSaved: () => void }) {
  const [rows, setRows] = useState<InventoryImportRow[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<Array<{ variantId: string; saved: boolean; error?: string }>>([]);
  async function apply() {
    if (
      busy ||
      !rows.length ||
      !window.confirm(
        `Apply ${rows.length} stock adjustments? Every row is checked against its exported quantity and order reservations. Successful rows are saved independently; rejected rows remain unchanged.`,
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/inventory/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setResults(payload.results);
      setRows([]);
      onSaved();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Import failed. Retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="admin-card inventory-bulk">
      <summary>Update many at once (spreadsheet)</summary>
      <p>
        Optional. Export your stock to a spreadsheet, edit the numbers, and import it to update lots of items together.
      </p>
      <details>
        <summary>How to use the stock spreadsheet</summary>
        <p>
          Download the CSV, edit mode (add, remove or set) and quantity, then import up to 100 variants. Keep expected
          quantities unchanged so concurrent edits are detected.
        </p>
      </details>
      <a className="button button-secondary" href="/api/admin/inventory/export">
        Export all inventory
      </a>
      <label className="field">
        Import stock CSV
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            setRows([]);
            setResults([]);
            setMessage("");
            if (!file) return;
            try {
              if (file.size > 200000) throw new Error("Choose a CSV smaller than 200 KB.");
              const imported = parseInventoryCsv(await file.text());
              setLabels(
                Object.fromEntries(
                  imported.map((row, index) => [
                    row.variantId,
                    [row.productName, row.variantName || row.sku].filter(Boolean).join(" · ") ||
                      `Stock item ${index + 1}`,
                  ]),
                ),
              );
              setRows(imported);
            } catch (reason) {
              setMessage(reason instanceof Error ? reason.message : "Invalid CSV.");
            }
          }}
        />
      </label>
      {rows.length > 0 && (
        <>
          <p>{rows.length} adjustments ready for review.</p>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Variant</th>
                  <th>Current</th>
                  <th>Action</th>
                  <th>Quantity</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.variantId}>
                    <td>
                      {labels[row.variantId]}
                      <details>
                        <summary>Item IDs</summary>
                        <small>
                          {row.productId}
                          <br />
                          {row.variantId}
                        </small>
                      </details>
                    </td>
                    <td>{row.expected}</td>
                    <td>{row.mode}</td>
                    <td>{row.quantity}</td>
                    <td>
                      {row.mode === "set"
                        ? row.quantity
                        : row.expected + (row.mode === "add" ? row.quantity : -row.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button disabled={busy} onClick={apply}>
            {busy ? "Applying…" : "Confirm bulk adjustments"}
          </Button>
        </>
      )}
      {message && <p role="alert">{message}</p>}
      {results.length > 0 && (
        <div role="status">
          <p>
            {results.filter((row) => row.saved).length} saved · {results.filter((row) => !row.saved).length} rejected
          </p>
          <ul>
            {results.map((row) => (
              <li key={row.variantId}>
                {labels[row.variantId] ?? "Stock item"}: {row.saved ? "Saved" : row.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}

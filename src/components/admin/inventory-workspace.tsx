"use client";
import { isVariantInventoryTracked } from "@/features/catalog/availability";
import { InventoryBulk } from "./inventory-bulk";
import { useCallback, useEffect, useState } from "react";
import type { Product } from "@/types";
import { Button, EmptyState, Input, Select } from "@/components/ui/primitives";

type Variant = Product["variants"][number];
// Inline stock editing: show the current number, nudge it with −/+ or type a new one,
// and Save only lights up when it actually changed. No modes, no popup.
function StockRow({ product, variant, onSaved }: { product: Product; variant: Variant; onSaved: () => void }) {
  const current = variant.stockQuantity;
  const [value, setValue] = useState(String(current));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const amount = Number(value);
  const valid = value !== "" && Number.isInteger(amount) && amount >= 0 && amount <= 2147483647;
  const changed = valid && amount !== current;
  const nudge = (delta: number) => {
    setMessage("");
    setValue((previous) => String(Math.max(0, (Number(previous) || 0) + delta)));
  };
  async function save() {
    if (busy || !changed || conflict) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/inventory/adjust", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          variantId: variant.id,
          expected: current,
          mode: "set",
          quantity: amount,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setConflict(response.status === 409);
        throw new Error(payload.error);
      }
      setMessage("Saved ✓");
      onSaved();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Stock could not be saved. Retry.");
    } finally {
      setBusy(false);
    }
  }
  const status = current === 0 ? "out" : current <= product.lowStockThreshold ? "low" : "ok";
  return (
    <form
      className="stock-row"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="stock-row-id">
        <b>{variant.name}</b>
        <small>{variant.sku || "No SKU"}</small>
        {status !== "ok" && (
          <span className={`stock-tag ${status}`}>{status === "out" ? "Out of stock" : "Running low"}</span>
        )}
      </div>
      <div className="stock-stepper">
        <button
          type="button"
          onClick={() => nudge(-1)}
          disabled={busy || amount <= 0}
          aria-label={`Remove one ${variant.name}`}
        >
          −
        </button>
        <input
          type="number"
          min="0"
          max="2147483647"
          step="1"
          inputMode="numeric"
          aria-label={`${variant.name} quantity in stock`}
          value={value}
          disabled={busy}
          onChange={(event) => {
            setValue(event.target.value);
            setMessage("");
          }}
        />
        <button type="button" onClick={() => nudge(1)} disabled={busy} aria-label={`Add one ${variant.name}`}>
          +
        </button>
      </div>
      <Button type="submit" variant={changed ? "primary" : "secondary"} disabled={busy || !changed || conflict}>
        {busy ? "Saving…" : "Save"}
      </Button>
      {message && (
        <p className="stock-row-status" role="status">
          {message}
        </p>
      )}
      {conflict && (
        <Button variant="secondary" onClick={onSaved}>
          Refresh stock
        </Button>
      )}
    </form>
  );
}
export function InventoryWorkspace({ onEdit }: { onEdit: (product: Product) => void }) {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const size = 25;
  const [sort, setSort] = useState("name");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const [view, setView] = useState("ATTENTION");
  const active = (p: Product) => p.variants.filter((v) => v.active);
  // Three plain tabs. The server still understands the other filters; we just don't
  // clutter the owner's view with them.
  const categories: Array<{ key: string; label: string }> = [
    { key: "ATTENTION", label: "Needs attention" },
    { key: "ALL", label: "All stock" },
    { key: "UNTRACKED", label: "Made to order" },
  ];
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision reloads after an adjustment or explicit retry.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: query, category: view, page: String(page), size: String(size), sort });
      fetch(`/api/admin/inventory?${params}`, { signal: controller.signal, cache: "no-store" })
        .then(async (response) => {
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          if (!controller.signal.aborted) {
            setProducts(result.products);
            setCounts(result.counts);
            setTotal(result.total);
          }
        })
        .catch((reason) => {
          if (!controller.signal.aborted) setError(reason.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, view, page, size, sort, revision]);
  const visible = products;

  return (
    <div className="inventory-workspace">
      <nav className="history-categories" aria-label="Stock views">
        {categories.map((category) => (
          <button
            type="button"
            key={category.key}
            aria-pressed={view === category.key}
            onClick={() => {
              setView(category.key);
              setPage(1);
            }}
          >
            {category.label}
            <span>{counts[category.key] ?? 0}</span>
          </button>
        ))}
      </nav>
      <div className="inventory-controls">
        <Input
          label="Search stock"
          placeholder="Search by product, option or SKU"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
        <Select
          label="Sort by"
          value={sort}
          onChange={(event) => {
            setSort(event.target.value);
            setPage(1);
          }}
        >
          <option value="name">Product name</option>
          <option value="quantity">Lowest stock first</option>
        </Select>
      </div>
      {loading && <p role="status">Loading stock…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <Button onClick={refresh}>Try again</Button>
        </div>
      )}
      {!loading && !error && !visible.length && (
        <EmptyState
          title="Nothing here"
          body={view === "ATTENTION" ? "Great — nothing is low or out of stock." : "Try another view or search."}
        />
      )}
      {!error &&
        visible.map((p) => {
          const madeToOrder = !p.variants.some((v) => isVariantInventoryTracked(p, v));
          return (
            <details className="admin-card inventory-product-group" key={p.id} open={view === "ATTENTION"}>
              <summary>
                <b>{p.name}</b>
                <span>
                  {madeToOrder
                    ? "Made to order"
                    : `${active(p).reduce((sum, v) => sum + v.stockQuantity, 0)} in stock · ${active(p).length} ${
                        active(p).length === 1 ? "option" : "options"
                      }`}
                </span>
              </summary>
              {madeToOrder ? (
                <p className="inventory-note">Made to order — there’s no stock to count here.</p>
              ) : (
                p.variants.map((v) =>
                  isVariantInventoryTracked(p, v) ? (
                    <StockRow key={`${v.id}-${v.stockQuantity}`} product={p} variant={v} onSaved={refresh} />
                  ) : (
                    <p className="inventory-note" key={v.id}>
                      {v.name}: made to order{v.active ? "" : " · hidden from customers"}
                    </p>
                  ),
                )
              )}
              <Button variant="ghost" onClick={() => onEdit(p)}>
                Edit product
              </Button>
            </details>
          );
        })}
      {!loading && !error && total > size && (
        <div className="history-pagination">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            Previous
          </Button>
          <span>
            Page {page} of {Math.max(1, Math.ceil(total / size))}
          </span>
          <Button variant="secondary" disabled={page * size >= total} onClick={() => setPage((value) => value + 1)}>
            Next
          </Button>
        </div>
      )}
      <InventoryBulk onSaved={refresh} />
    </div>
  );
}

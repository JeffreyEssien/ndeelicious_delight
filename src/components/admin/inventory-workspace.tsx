"use client";
import { InventoryBulk } from "./inventory-bulk";
import { useCallback, useEffect, useState } from "react";
import type { Product } from "@/types";
import { Button, EmptyState, Input, Select } from "@/components/ui/primitives";

type Variant = Product["variants"][number];
function Adjustment({ product, variant, onSaved }: { product: Product; variant: Variant; onSaved: () => void }) {
  const [mode, setMode] = useState("add");
  const [quantity, setQuantity] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState<number>();
  const [conflict, setConflict] = useState(false);
  const current = saved ?? variant.stockQuantity;
  const amount = Number(quantity);
  const result = mode === "add" ? current + amount : mode === "remove" ? current - amount : amount;
  const valid = quantity !== "" && Number.isInteger(amount) && amount >= 0 && result >= 0 && result <= 2147483647;
  async function save() {
    if (busy || !valid || conflict) return;
    if (!window.confirm(`${product.name} · ${variant.name}: change stock from ${current} to ${result}?`)) return;
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
          mode,
          quantity: amount,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setConflict(response.status === 409);
        throw new Error(payload.error);
      }
      setSaved(payload.quantity);
      setQuantity("");
      setMessage("Stock saved.");
      onSaved();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Stock could not be saved. Retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="inventory-adjustment"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div>
        <b>{variant.name}</b>
        <small>{variant.sku || "No SKU"}</small>
        <span>
          Current quantity: <strong>{current}</strong>
        </span>
      </div>
      <Select
        label="Adjustment"
        value={mode}
        disabled={busy}
        onChange={(e) => {
          setMode(e.target.value);
          setMessage("");
        }}
      >
        <option value="add">Add quantity</option>
        <option value="remove">Remove quantity</option>
        <option value="set">Set exact quantity</option>
      </Select>
      <Input
        label="Quantity"
        type="number"
        min="0"
        max="2147483647"
        step="1"
        value={quantity}
        disabled={busy}
        onChange={(e) => {
          setQuantity(e.target.value);
          setMessage("");
        }}
      />
      <div>
        <span>
          Result: <strong>{valid ? result : "—"}</strong>
        </span>
        <Button type="submit" disabled={busy || !valid || conflict || result === current}>
          {busy ? "Saving…" : "Confirm adjustment"}
        </Button>
      </div>
      {message && <p role="status">{message}</p>}
      {conflict && (
        <Button variant="secondary" onClick={onSaved}>
          Refresh inventory
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
  const [size, setSize] = useState(25);
  const [sort, setSort] = useState("name");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const [view, setView] = useState("ATTENTION");
  const tracked = (p: Product) => p.trackInventory !== false && !["DRAFT", "ARCHIVED"].includes(p.status);
  const active = (p: Product) => p.variants.filter((v) => v.active);
  const low = (p: Product) =>
    tracked(p) && active(p).some((v) => v.stockQuantity > 0 && v.stockQuantity <= p.lowStockThreshold);
  const out = (p: Product) => tracked(p) && active(p).some((v) => v.stockQuantity === 0);
  const categories: Record<string, { label: string; matches: (p: Product) => boolean }> = {
    ATTENTION: { label: "Needs attention", matches: (p) => low(p) || out(p) },
    LOW: { label: "Low stock", matches: low },
    OUT: { label: "Out of stock", matches: out },
    ALL: { label: "All tracked stock", matches: tracked },
    UNTRACKED: { label: "Not tracked / made to order", matches: (p) => p.trackInventory === false },
    INACTIVE: { label: "Inactive products", matches: (p) => ["DRAFT", "ARCHIVED"].includes(p.status) },
  };
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
      <nav className="history-categories" aria-label="Inventory categories">
        {Object.entries(categories).map(([key, category]) => (
          <button
            type="button"
            key={key}
            aria-pressed={view === key}
            onClick={() => {
              setView(key);
              setPage(1);
            }}
          >
            {category.label}
            <span>{counts[key] ?? 0}</span>
          </button>
        ))}
      </nav>
      <InventoryBulk onSaved={refresh} />
      <Input
        label="Search stock"
        placeholder="Product, variant, SKU or category"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(1);
        }}
      />
      <div className="history-filter-actions">
        <Select
          label="Sort stock"
          value={sort}
          onChange={(event) => {
            setSort(event.target.value);
            setPage(1);
          }}
        >
          <option value="name">Product name</option>
          <option value="quantity">Lowest quantity</option>
        </Select>
        <Select
          label="Per page"
          value={size}
          onChange={(event) => {
            setSize(Number(event.target.value));
            setPage(1);
          }}
        >
          {[25, 50, 100].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </Select>
        <Button onClick={refresh}>Refresh inventory</Button>
      </div>
      {loading && <p role="status">Loading stock…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <Button onClick={refresh}>Retry</Button>
        </div>
      )}
      {!loading && !error && !visible.length && (
        <EmptyState title="No products in this view" body="Try another category or search." />
      )}
      {!error &&
        visible.map((p) => (
          <details className="admin-card inventory-product-group" key={p.id}>
            <summary>
              <b>{p.name}</b>
              <span>
                {active(p).length} available variants ·{" "}
                {p.trackInventory === false
                  ? "Made to order"
                  : `${active(p).reduce((sum, v) => sum + v.stockQuantity, 0)} units on hand`}
              </span>
            </summary>
            <Button variant="ghost" onClick={() => onEdit(p)}>
              Edit product settings
            </Button>
            {p.trackInventory === false ? (
              <p>This product is made to order. Stock shortages do not apply.</p>
            ) : (
              p.variants.map((v) => (
                <div key={`${v.id}-${v.stockQuantity}`}>
                  <p>{!v.active && "Inactive variant — hidden from customers"}</p>
                  <Adjustment product={p} variant={v} onSaved={refresh} />
                </div>
              ))
            )}
          </details>
        ))}
      {!loading && !error && (
        <div className="history-pagination">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            Previous
          </Button>
          <span>
            {total} products · Page {page} of {Math.max(1, Math.ceil(total / size))}
          </span>
          <Button variant="secondary" disabled={page * size >= total} onClick={() => setPage((value) => value + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

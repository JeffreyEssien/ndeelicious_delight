"use client";
import Image from "next/image";
import { isVariantInventoryTracked } from "@/features/catalog/availability";
import { InventoryBulk } from "./inventory-bulk";
import { useCallback, useEffect, useState } from "react";
import type { Product } from "@/types";
import type { VariantInsight } from "@/lib/data/inventory-insights";
import { Button, EmptyState } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icons";
import { useBusinessSettings, useToast } from "@/components/providers";
import { formatDate } from "@/lib/format";

type Variant = Product["variants"][number];
type Mode = "add" | "remove" | "set";

// Quick reasons per kind of change, so the history reads as a story without typing.
const reasons: Record<Mode, string[]> = {
  add: ["Baked a batch", "Restocked", "Returned to stock"],
  remove: ["Sold in person", "Damaged or expired", "Used for samples"],
  set: ["Stock count", "Correction"],
};
const modeLabel: Record<Mode, string> = { add: "Add", remove: "Remove", set: "Set to" };

const views: Array<{ key: string; label: string; tone: string }> = [
  { key: "ATTENTION", label: "Needs attention", tone: "attention" },
  { key: "OUT", label: "Out of stock", tone: "out" },
  { key: "LOW", label: "Running low", tone: "low" },
  { key: "ALL", label: "All tracked", tone: "all" },
  { key: "UNTRACKED", label: "Made to order", tone: "untracked" },
];

function ago(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

function StockRow({
  product,
  variant,
  insight,
  onSaved,
}: {
  product: Product;
  variant: Variant;
  insight?: VariantInsight;
  onSaved: () => void;
}) {
  const business = useBusinessSettings();
  const notify = useToast();
  const current = variant.stockQuantity;
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [mode, setMode] = useState<Mode>("add");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const amount = Number(value);
  const valid = value !== "" && Number.isInteger(amount) && amount >= 0 && amount <= 2147483647;
  const result = !valid ? null : mode === "add" ? current + amount : mode === "remove" ? current - amount : amount;
  const changed = result !== null && result >= 0 && result !== current;
  const held = insight?.held ?? 0;
  const sold = insight?.sold30 ?? 0;
  const daysLeft = sold > 0 && current > 0 ? Math.floor(current / (sold / 30)) : null;
  const threshold = product.lowStockThreshold;
  const status = current === 0 ? "out" : current <= threshold ? "low" : "ok";
  // The bar fills relative to three times the alert level, so "healthy" reads as mostly full.
  const level = Math.min(1, current / Math.max(1, threshold * 3));

  function close() {
    setEditing(false);
    setValue("");
    setReason("");
    setError("");
  }
  async function save() {
    if (busy || !changed || conflict) return;
    setBusy(true);
    setError("");
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
          reason: reason || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setConflict(response.status === 409);
        throw new Error(payload.error);
      }
      notify(`${product.name} · ${variant.name}: ${current} → ${payload.quantity ?? result}`);
      close();
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Stock could not be saved. Retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`sk-row is-${status}`}>
      <div className="sk-row-main">
        <div className="sk-name">
          <b>{variant.name}</b>
          <small>{variant.sku || "No SKU"}</small>
        </div>
        <div className="sk-level">
          <div className="sk-count">
            <b>{current}</b>
            <em className={`sk-chip is-${status}`}>
              {status === "out" ? "Out of stock" : status === "low" ? "Running low" : "In stock"}
            </em>
          </div>
          <span className="sk-bar" aria-hidden="true">
            <span style={{ width: `${Math.round(level * 100)}%` }} />
          </span>
          <small>
            {held > 0 && (
              <>
                {held} held for checkouts · {Math.max(0, current - held)} free ·{" "}
              </>
            )}
            {sold > 0
              ? `Sold ${sold} in 30 days${daysLeft !== null ? ` · about ${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : ""}`
              : "No sales in 30 days"}
          </small>
        </div>
        <div className="sk-buttons">
          <button
            type="button"
            className={`sk-adjust${editing ? " is-open" : ""}`}
            aria-expanded={editing}
            onClick={() => (editing ? close() : setEditing(true))}
          >
            {editing ? "Cancel" : "Adjust"}
          </button>
          <button
            type="button"
            className="sk-icon"
            aria-label={`History for ${variant.name}`}
            aria-expanded={showHistory}
            onClick={() => setShowHistory((value) => !value)}
          >
            <Icon name="clock" />
          </button>
        </div>
      </div>
      {editing && (
        <form
          className="sk-editor"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <fieldset className="sk-modes" aria-label="Kind of change">
            {(Object.keys(modeLabel) as Mode[]).map((key) => (
              <button
                type="button"
                key={key}
                aria-pressed={mode === key}
                onClick={() => {
                  setMode(key);
                  setReason("");
                  setError("");
                }}
              >
                {modeLabel[key]}
              </button>
            ))}
          </fieldset>
          <label className="sk-amount">
            <span>{mode === "set" ? "New total" : mode === "add" ? "How many to add" : "How many to remove"}</span>
            <input
              type="number"
              min="0"
              max="2147483647"
              step="1"
              inputMode="numeric"
              // biome-ignore lint/a11y/noAutofocus: the editor opens because the owner asked to type a number.
              autoFocus
              aria-label={`${variant.name}: ${mode === "set" ? "new total" : `quantity to ${mode}`}`}
              value={value}
              disabled={busy}
              onChange={(event) => {
                setValue(event.target.value);
                setError("");
              }}
            />
          </label>
          <fieldset className="sk-reasons" aria-label="Reason (optional)">
            {reasons[mode].map((item) => (
              <button
                type="button"
                key={item}
                aria-pressed={reason === item}
                onClick={() => setReason((current) => (current === item ? "" : item))}
              >
                {item}
              </button>
            ))}
          </fieldset>
          <div className="sk-save">
            <span
              className={`sk-preview${(result !== null && result < 0) || (value !== "" && result === null) ? " is-bad" : value === "" ? " is-hint" : ""}`}
            >
              {result === null
                ? value === ""
                  ? "Type a number"
                  : "Enter a whole number"
                : result < 0
                  ? `Only ${current} in stock`
                  : `${current} → ${result}`}
            </span>
            <Button type="submit" disabled={busy || !changed || conflict}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
          {error && (
            <p className="sk-error" role="alert">
              {error}{" "}
              {conflict && (
                <button type="button" className="text-button" onClick={onSaved}>
                  Refresh stock
                </button>
              )}
            </p>
          )}
        </form>
      )}
      {showHistory && (
        <div className="sk-history">
          {insight?.history.length ? (
            <ol>
              {insight.history.map((change) => (
                <li key={`${change.at}-${change.to}`}>
                  <b>
                    {change.from ?? "?"} → {change.to ?? "?"}
                  </b>
                  <span>{change.reason ?? (change.mode ? modeLabel[change.mode as Mode] : "Adjusted")}</span>
                  <small>
                    {ago(change.at)} · {formatDate(change.at, business.locale, business.timezone)}
                    {change.by ? ` · ${change.by}` : ""}
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <p>No manual changes yet. Sales and refunds adjust stock on their own.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function InventoryWorkspace({ onEdit }: { onEdit: (product: Product) => void }) {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [insights, setInsights] = useState<Record<string, VariantInsight>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const size = 25;
  const [sort, setSort] = useState("quantity");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [showBulk, setShowBulk] = useState(false);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const [view, setView] = useState("ATTENTION");
  // Remember the chosen view between visits, so coming back lands where the owner left off.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("ndee_stock_view");
      if (saved && views.some((item) => item.key === saved)) setView(saved);
    } catch {
      // Storage can be unavailable; the default view is fine.
    }
  }, []);
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
            setInsights(result.insights ?? {});
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
  function choose(key: string) {
    setView(key);
    setPage(1);
    try {
      sessionStorage.setItem("ndee_stock_view", key);
    } catch {
      // Not remembered this time.
    }
  }

  return (
    <div className="inventory-workspace sk">
      <nav className="sk-tiles" aria-label="Stock views">
        {views.map((item) => (
          <button
            type="button"
            key={item.key}
            className={`is-${item.tone}`}
            aria-pressed={view === item.key}
            onClick={() => choose(item.key)}
          >
            <b>{counts[item.key] ?? (loading ? "…" : 0)}</b>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sk-toolbar">
        <label className="hw-search">
          <Icon name="search" />
          <input
            type="search"
            aria-label="Search stock"
            placeholder="Search by product, option or SKU"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="hw-sort">
          <select
            aria-label="Sort by"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setPage(1);
            }}
          >
            <option value="quantity">Lowest stock first</option>
            <option value="name">Product name</option>
          </select>
        </label>
        <button type="button" className="hw-tool" aria-label="Refresh" onClick={refresh}>
          <Icon name="refresh" /> <span>Refresh</span>
        </button>
        <button
          type="button"
          className="hw-tool"
          aria-expanded={showBulk}
          onClick={() => setShowBulk((value) => !value)}
        >
          <Icon name="download" /> <span>Spreadsheet</span>
        </button>
      </div>
      {showBulk && <InventoryBulk onSaved={refresh} />}
      {loading && !products.length && (
        <div className="hw-skeleton" role="status" aria-label="Loading stock">
          {["one", "two", "three"].map((key) => (
            <span key={key} />
          ))}
        </div>
      )}
      {error && (
        <div className="hw-error" role="alert">
          <p>{error}</p>
          <Button onClick={refresh}>Try again</Button>
        </div>
      )}
      {!loading && !error && !products.length && (
        <EmptyState
          title={view === "ATTENTION" ? "All stocked up" : "Nothing here"}
          body={
            view === "ATTENTION"
              ? "Nothing is low or out of stock right now."
              : "Try another view or a different search."
          }
        />
      )}
      {!error && (
        <div className="sk-list" aria-busy={loading}>
          {products.map((p) => {
            const tracked = p.variants.filter((v) => isVariantInventoryTracked(p, v));
            const photo = p.images?.[0]?.url ?? p.image;
            return (
              <article className="sk-card" key={p.id}>
                <header>
                  {photo ? (
                    <Image src={photo} alt="" width={48} height={48} className="sk-photo" unoptimized />
                  ) : (
                    <span className="sk-photo" />
                  )}
                  <div>
                    <h3>{p.name}</h3>
                    <small>
                      {tracked.length
                        ? `${tracked.reduce((sum, v) => sum + v.stockQuantity, 0)} in stock · alert at ${p.lowStockThreshold} or fewer`
                        : "Made to order, so there’s nothing to count"}
                      {p.status !== "ACTIVE" && ` · ${p.status.toLowerCase().replaceAll("_", " ")}`}
                    </small>
                  </div>
                  <button type="button" className="hw-tool" onClick={() => onEdit(p)}>
                    Edit product
                  </button>
                </header>
                {tracked.map((v) => (
                  <StockRow
                    key={`${v.id}-${v.stockQuantity}`}
                    product={p}
                    variant={v}
                    insight={insights[v.id]}
                    onSaved={refresh}
                  />
                ))}
                {p.variants
                  .filter((v) => !isVariantInventoryTracked(p, v) && tracked.length)
                  .map((v) => (
                    <p className="sk-note" key={v.id}>
                      {v.name}: made to order{v.active ? "" : " · hidden from customers"}
                    </p>
                  ))}
              </article>
            );
          })}
        </div>
      )}
      {!error && total > size && (
        <div className="hw-pagination">
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
    </div>
  );
}

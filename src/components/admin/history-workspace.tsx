"use client";
import Image from "next/image";
import { confirmSectionChange } from "./use-unsaved-changes";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Badge, Button, EmptyState, Input, Select } from "@/components/ui/primitives";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import { useBusinessSettings } from "@/components/providers";
import { formatDate, formatMoney } from "@/lib/format";
import { historyCategories, type HistoryKind, type HistoryPage, type HistoryRow } from "@/lib/data/admin-history";

const label = (value: string) => value.toLowerCase().replaceAll("_", " ");
type Filters = Record<string, string>;
const defaults: Filters = {
  q: "",
  category: "ALL",
  stage: "",
  payment: "",
  fulfilment: "",
  from: "",
  to: "",
  sort: "newest",
  size: "25",
  page: "1",
};

export function HistoryWorkspace<T>({
  kind,
  renderDetail,
}: {
  kind: HistoryKind;
  renderDetail: (record: T, close: () => void, refresh: () => Promise<void>) => ReactNode;
}) {
  const business = useBusinessSettings();
  const [filters, setFilters] = useState<Filters>(defaults);
  const [draft, setDraft] = useState<Filters>(defaults);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState<HistoryPage>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<Pick<HistoryRow, "id" | "number">>();
  const [detail, setDetail] = useState<{ identifier: string; record: T }>();
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRevision, setDetailRevision] = useState(0);
  const [selection, setSelection] = useState<Record<string, HistoryRow>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResults, setBulkResults] = useState<Array<{ number: string; outcome: string; message: string }>>([]);
  useEffect(() => {
    function restore() {
      const params = new URLSearchParams(window.location.search);
      const restored = {
        ...defaults,
        ...Object.fromEntries([...params].filter(([key]) => key in defaults || key === "asOf")),
      };
      const identifier = params.get("detail");
      setDetail(undefined);
      setDetailError("");
      setSelected(identifier ? { id: identifier, number: identifier } : undefined);
      setSelection({});
      setFilters(restored);
      setDraft(restored);
      setReady(true);
    }
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision intentionally triggers a retry after errors or mutations.
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== ""));
    fetch(`/api/admin/history/${kind}?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "History could not be loaded.");
        if (controller.signal.aborted) return;
        setPage(result);
        // Freeze newly inserted records out of subsequent page requests. Refresh
        // intentionally clears this timestamp to include the latest records.
        if (!filters.asOf) {
          const url = new URL(window.location.href);
          url.searchParams.set("asOf", result.asOf);
          window.history.replaceState(null, "", url);
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filters, kind, ready, revision]);
  function navigate(next: Filters, resetSnapshot = false) {
    const state = { ...next };
    if (resetSnapshot) delete state.asOf;
    else state.asOf = state.asOf || page?.asOf || "";
    const params = new URLSearchParams(Object.entries(state).filter(([, value]) => value !== ""));
    window.history.pushState(null, "", `${window.location.pathname}?${params}`);
    setSelection({});
    setFilters(state);
    setDraft(state);
  }
  function closeDetail() {
    if (!confirmSectionChange()) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("detail");
    window.history.replaceState(null, "", url);
    setSelected(undefined);
  }
  const refresh = useCallback(async () => {
    setRevision((value) => value + 1);
    setDetailRevision((value) => value + 1);
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: detailRevision refreshes the authoritative detail after a mutation.
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError("");
    const identifier = kind === "orders" ? selected.number : selected.id;
    fetch(`/api/admin/history/${kind}/${encodeURIComponent(identifier)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Details could not be loaded.");
        if (kind === "orders" ? result.id !== identifier : result.id !== selected.id)
          throw new Error("The returned record does not match your selection. Retry.");
        if (!controller.signal.aborted) setDetail({ identifier, record: result });
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setDetailError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [kind, selected, detailRevision]);
  async function advanceSelected() {
    if (bulkBusy || !Object.keys(selection).length) return;
    if (
      !window.confirm(
        `Advance ${Object.keys(selection).length} selected orders to their next fulfilment stage? Each order will be validated.`,
      )
    )
      return;
    setBulkBusy(true);
    setBulkResults([]);
    try {
      const response = await fetch("/api/admin/orders/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orders: Object.values(selection).map((row) => ({ number: row.number, expectedStatus: row.status })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setBulkResults(payload.results);
      setSelection({});
      await refresh();
    } catch (reason) {
      setBulkResults([
        {
          number: "Selected orders",
          outcome: "failed",
          message: reason instanceof Error ? reason.message : "Could not update orders. Retry.",
        },
      ]);
    } finally {
      setBulkBusy(false);
    }
  }
  const edit = (key: string, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const lastPage = Math.max(1, Math.ceil((page?.total ?? 0) / Number(filters.size)));
  return (
    <div className="history-workspace">
      <p className="muted">Category badges show all-time totals. Filters below narrow the matching results.</p>
      <nav className="history-categories" aria-label={kind === "orders" ? "Order categories" : "Request categories"}>
        {Object.entries(historyCategories[kind]).map(([key, title]) => (
          <button
            type="button"
            key={key}
            aria-pressed={filters.category === key}
            onClick={() => navigate({ ...filters, category: key, page: "1" })}
          >
            {title}
            <span>{page?.counts[key] ?? (loading ? "…" : 0)}</span>
          </button>
        ))}
      </nav>
      <form
        className="admin-card history-filters"
        onSubmit={(event) => {
          event.preventDefault();
          navigate({ ...draft, page: "1" }, true);
        }}
      >
        <Input
          label="Search history"
          placeholder="Number, customer, email or phone"
          value={draft.q}
          onChange={(e) => edit("q", e.target.value)}
        />
        <details className="history-advanced-filters">
          <summary>More filters</summary>
          <div>
            <Select label="Fulfilment stage" value={draft.stage} onChange={(e) => edit("stage", e.target.value)}>
              <option value="">All stages</option>
              {(kind === "orders"
                ? [
                    "PENDING_PAYMENT",
                    "PAID",
                    "CONFIRMED",
                    "PREPARING",
                    "READY",
                    "OUT_FOR_DELIVERY",
                    "DELIVERED",
                    "CANCELLED",
                    "REFUNDED",
                    "FAILED",
                  ]
                : [
                    "DRAFT",
                    "QUOTE_REQUIRED",
                    "QUOTE_SENT",
                    "CUSTOMER_APPROVED",
                    "PENDING_PAYMENT",
                    "PAID",
                    "CONFIRMED",
                    "PREPARING",
                    "READY",
                    "OUT_FOR_DELIVERY",
                    "DELIVERED",
                    "CANCELLED",
                    "REFUNDED",
                  ]
              ).map((stage) => (
                <option key={stage} value={stage}>
                  {label(stage)}
                </option>
              ))}
            </Select>
            {kind === "orders" && (
              <>
                <Select label="Payment" value={draft.payment} onChange={(e) => edit("payment", e.target.value)}>
                  <option value="">All payments</option>
                  {["UNPAID", "PENDING", "SUCCEEDED", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"].map((status) => (
                    <option key={status} value={status}>
                      {label(status)}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Fulfilment method"
                  value={draft.fulfilment}
                  onChange={(e) => edit("fulfilment", e.target.value)}
                >
                  <option value="">All methods</option>
                  <option value="pickup">Pickup</option>
                  <option value="delivery">Delivery</option>
                </Select>
              </>
            )}
            <Input label="Created from" type="date" value={draft.from} onChange={(e) => edit("from", e.target.value)} />
            <Input
              label="Created through"
              type="date"
              value={draft.to}
              min={draft.from || undefined}
              onChange={(e) => edit("to", e.target.value)}
            />
          </div>
        </details>
        <Select label="Sort" value={draft.sort} onChange={(e) => edit("sort", e.target.value)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="total-desc">Highest total</option>
          <option value="total-asc">Lowest total</option>
          <option value="deadline">Fulfilment date</option>
        </Select>
        <Select label="Per page" value={draft.size} onChange={(e) => edit("size", e.target.value)}>
          {[25, 50, 100].map((size) => (
            <option key={size}>{size}</option>
          ))}
        </Select>
        <div className="history-filter-actions">
          <a
            className="button button-secondary"
            href={`/api/admin/history/${kind}/export?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== ""))}`}
          >
            Export filtered summaries
          </a>
          <Button type="submit">Apply filters</Button>
          <Button variant="secondary" onClick={() => navigate({ ...defaults }, true)}>
            Reset
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              navigate({ ...filters, page: "1" }, true);
              setRevision((v) => v + 1);
            }}
          >
            Refresh
          </Button>
        </div>
      </form>
      {kind === "orders" && (
        <div className="history-bulk-actions">
          <Button disabled={loading || bulkBusy || !Object.keys(selection).length} onClick={advanceSelected}>
            {bulkBusy ? "Updating…" : `Advance selected (${Object.keys(selection).length})`}
          </Button>
          <small>Payment changes and refunds require individual review.</small>
          {bulkResults.length > 0 && (
            <ul role="status">
              {bulkResults.map((result) => (
                <li key={result.number}>
                  {result.number} · {result.outcome}: {result.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="admin-card history-results" aria-busy={loading}>
        {loading ? (
          <p role="status">Loading history…</p>
        ) : error ? (
          <div role="alert">
            <p>{error}</p>
            <Button onClick={() => setRevision((v) => v + 1)}>Retry</Button>
          </div>
        ) : (
          <>
            <p role="status">
              {page?.total ?? 0} matching {kind === "orders" ? "orders" : "requests"}. Category counts cover the full
              history.
            </p>
            {!page?.rows.length ? (
              <EmptyState title="No matches" body="Try another category or reset your filters." />
            ) : (
              <table className="history-list">
                <thead>
                  <tr>
                    <th>Order / request and customer</th>
                    <th>Dates</th>
                    <th>Stage and payment</th>
                    <th>Total</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((row) => (
                    <tr key={row.id}>
                      <td className="history-identity">
                        {kind === "orders" &&
                          ["PAID", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"].includes(row.status) && (
                            <label className="check-row">
                              <input
                                type="checkbox"
                                aria-label={`Select ${row.number}`}
                                disabled={bulkBusy}
                                checked={Boolean(selection[row.id])}
                                onChange={(event) =>
                                  setSelection((current) => {
                                    const next = { ...current };
                                    if (event.target.checked) next[row.id] = row;
                                    else delete next[row.id];
                                    return next;
                                  })
                                }
                              />
                              Select order
                            </label>
                          )}
                        {row.thumbnailUrl && (
                          <Image
                            width={56}
                            height={56}
                            unoptimized
                            className="history-thumbnail"
                            src={row.thumbnailUrl}
                            alt="Cake inspiration"
                            loading="lazy"
                          />
                        )}
                        <b>{row.number}</b>
                        <span>{row.customer}</span>
                        <small>
                          {kind === "cakes"
                            ? row.occasion || "Custom cake"
                            : `${row.items ?? 0} items · ${row.fulfilment || "—"}`}
                        </small>
                      </td>
                      <td className="history-dates">
                        <small>Created {formatDate(row.createdAt, business.locale, business.timezone)}</small>
                        {row.deadline && <small>Requested {row.deadline}</small>}
                      </td>
                      <td className="history-status">
                        <Badge>{label(row.status)}</Badge>
                        {row.paymentStatus && <small>Payment: {label(row.paymentStatus)}</small>}
                      </td>
                      <td className="history-total">
                        <b>
                          {row.total === null
                            ? "Quote required"
                            : formatMoney(row.total, row.currency || business.currency, business.locale)}
                        </b>
                      </td>
                      <td>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setDetail(undefined);
                            setSelected(row);
                            const url = new URL(window.location.href);
                            url.searchParams.set("detail", kind === "orders" ? row.number : row.id);
                            window.history.pushState(null, "", url);
                          }}
                        >
                          {kind === "orders" ? "Manage order" : "Review request"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="history-pagination">
              <Button
                variant="secondary"
                disabled={Number(filters.page) <= 1}
                onClick={() => navigate({ ...filters, page: String(Number(filters.page) - 1) })}
              >
                Previous
              </Button>
              <span>
                Page {filters.page} of {lastPage}
              </span>
              <Button
                variant="secondary"
                disabled={Number(filters.page) >= lastPage}
                onClick={() => navigate({ ...filters, page: String(Number(filters.page) + 1) })}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </div>
      {selected && (
        <ModalOverlay
          open
          onClose={closeDetail}
          className="admin-drawer history-detail"
          scrimClassName="admin-scrim"
          ariaLabel={selected.number}
        >
          <Button variant="secondary" onClick={closeDetail}>
            Back to {kind === "orders" ? "orders" : "requests"}
          </Button>
          {detail && detail.identifier === (kind === "orders" ? selected.number : selected.id) && (
            <div key={`${kind}:${detail.identifier}`}>{renderDetail(detail.record, closeDetail, refresh)}</div>
          )}
          {!detail && detailLoading && <p role="status">Loading details…</p>}
          {detailError && (
            <div role="alert">
              <p>{detailError}</p>
              <Button onClick={() => setDetailRevision((value) => value + 1)}>Retry</Button>
            </div>
          )}
        </ModalOverlay>
      )}
    </div>
  );
}

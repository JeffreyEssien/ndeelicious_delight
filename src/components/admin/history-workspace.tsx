"use client";
import Image from "next/image";
import { confirmSectionChange } from "./use-unsaved-changes";
import { useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Input, Select } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icons";
import { paymentTone, stageTone } from "./order-tones";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import { useBusinessSettings, useToast } from "@/components/providers";
import { formatDate, formatMoney } from "@/lib/format";
import { earlyReadyMessage } from "@/lib/orders/notice";
import { historyCategories, type HistoryKind, type HistoryPage, type HistoryRow } from "@/lib/data/admin-history";

type BulkResult = { number: string; outcome: string; message: string };
const label = (value: string) => value.toLowerCase().replaceAll("_", " ");

// The one next step for an order, matching admin_advance_order in the database.
function nextStep(row: HistoryRow) {
  switch (row.status) {
    case "PAID":
      return "Confirm";
    case "CONFIRMED":
      return "Start preparing";
    case "PREPARING":
      return "Mark ready";
    case "READY":
      return row.fulfilment === "pickup" ? "Mark collected" : "Send out";
    case "OUT_FOR_DELIVERY":
      return "Mark delivered";
    default:
      return null;
  }
}
function ago(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days}d ago` : "";
}
type Filters = Record<string, string>;
const defaults: Filters = {
  q: "",
  category: "ALL",
  stage: "",
  payment: "",
  fulfilment: "",
  productType: "",
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
  const notify = useToast();
  const linkedDetail = useSearchParams().get("detail");
  const [showFilters, setShowFilters] = useState(false);
  const [armed, setArmed] = useState<string>();
  const [advancing, setAdvancing] = useState<string>();
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
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
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
  // Follow ?detail when it changes in place, e.g. a notification tapped while already on this page.
  useEffect(() => {
    if (!ready || !linkedDetail) return;
    setSelected((current) =>
      current && (current.number === linkedDetail || current.id === linkedDetail)
        ? current
        : { id: linkedDetail, number: linkedDetail },
    );
  }, [linkedDetail, ready]);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(undefined), 3500);
    return () => clearTimeout(timer);
  }, [armed]);
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
  // Moves orders on. Orders still inside their notice period ask first; null means the admin held off.
  async function advanceOrders(
    orders: { number: string; expectedStatus: string }[],
  ): Promise<{ results: BulkResult[] } | null> {
    const send = (confirmEarly: boolean) =>
      fetch("/api/admin/orders/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orders, confirmEarly }),
      });
    let response = await send(false);
    let payload = await response.json();
    if (response.status === 409 && payload.early) {
      if (!window.confirm(earlyReadyMessage(payload.early, business.locale, business.timezone))) return null;
      response = await send(true);
      payload = await response.json();
    }
    if (!response.ok) throw new Error(payload.error ?? "The order could not advance. Retry.");
    return payload;
  }
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
      const payload = await advanceOrders(
        Object.values(selection).map((row) => ({ number: row.number, expectedStatus: row.status })),
      );
      if (!payload) return;
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
  // One tap arms the next step, a second tap runs it, so a slip can't email a customer.
  async function advanceRow(row: HistoryRow) {
    if (armed !== row.id) {
      setArmed(row.id);
      return;
    }
    setArmed(undefined);
    setAdvancing(row.id);
    try {
      const payload = await advanceOrders([{ number: row.number, expectedStatus: row.status }]);
      if (!payload) return;
      const result = payload.results[0];
      if (!result) throw new Error("The order could not advance. Retry.");
      notify(result.outcome === "successful" ? `${row.number}: ${result.message}` : `${row.number}: ${result.message}`);
      await refresh();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "The order could not advance. Retry.");
    } finally {
      setAdvancing(undefined);
    }
  }
  function openRow(row: HistoryRow) {
    setDetail(undefined);
    setSelected(row);
    const url = new URL(window.location.href);
    url.searchParams.set("detail", kind === "orders" ? row.number : row.id);
    window.history.pushState(null, "", url);
  }
  const activeFilters = ["stage", "payment", "productType", "from", "to"].filter((key) => filters[key]).length;
  const edit = (key: string, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const lastPage = Math.max(1, Math.ceil((page?.total ?? 0) / Number(filters.size)));
  return (
    <div className="history-workspace hw">
      <nav className="hw-tabs" aria-label={kind === "orders" ? "Order categories" : "Request categories"}>
        {Object.entries(historyCategories[kind]).map(([key, title]) => {
          const count = page?.counts[key];
          return (
            <button
              type="button"
              key={key}
              aria-pressed={filters.category === key}
              className={key === "ATTENTION" || key === "NEEDS_QUOTE" ? "is-urgent" : ""}
              onClick={() => navigate({ ...filters, category: key, page: "1" })}
            >
              {title}
              <span>{count ?? (loading ? "…" : 0)}</span>
            </button>
          );
        })}
      </nav>
      <form
        className="hw-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          navigate({ ...draft, page: "1" }, true);
        }}
      >
        <label className="hw-search">
          <Icon name="search" />
          <span className="sr-only">{kind === "orders" ? "Search orders" : "Search requests"}</span>
          <input
            type="search"
            aria-label={kind === "orders" ? "Search orders" : "Search requests"}
            placeholder="Number, name, email or phone"
            value={draft.q}
            onChange={(e) => edit("q", e.target.value)}
          />
        </label>
        {kind === "orders" && (
          <fieldset className="hw-segment" aria-label="Fulfilment method">
            {[
              ["", "All"],
              ["pickup", "Pickup"],
              ["delivery", "Delivery"],
            ].map(([value, title]) => (
              <button
                type="button"
                key={title}
                aria-pressed={filters.fulfilment === value}
                onClick={() => navigate({ ...filters, fulfilment: value, page: "1" })}
              >
                {title}
              </button>
            ))}
          </fieldset>
        )}
        <label className="hw-sort">
          <span className="sr-only">Sort</span>
          <select
            aria-label="Sort"
            value={filters.sort}
            onChange={(e) => navigate({ ...filters, sort: e.target.value, page: "1" })}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="deadline">Due soonest</option>
            <option value="total-desc">Highest total</option>
            <option value="total-asc">Lowest total</option>
          </select>
        </label>
        <button
          type="button"
          className="hw-tool"
          aria-label="Filters"
          aria-expanded={showFilters}
          onClick={() => setShowFilters((value) => !value)}
        >
          <Icon name="filter" /> <span>Filters</span>
          {activeFilters ? <b className="hw-count">{activeFilters}</b> : null}
        </button>
        <button
          type="button"
          className="hw-tool"
          aria-label="Refresh"
          onClick={() => {
            navigate({ ...filters, page: "1" }, true);
            setRevision((v) => v + 1);
          }}
        >
          <Icon name="refresh" /> <span>Refresh</span>
        </button>
        <a
          className="hw-tool"
          href={`/api/admin/history/${kind}/export?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== ""))}`}
        >
          <Icon name="download" /> <span>Export</span>
        </a>
        {showFilters && (
          <div className="hw-filters">
            <Select label="Stage" value={draft.stage} onChange={(e) => edit("stage", e.target.value)}>
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
                  label="Product type"
                  value={draft.productType}
                  onChange={(e) => edit("productType", e.target.value)}
                >
                  <option value="">All products</option>
                  <option value="custom-cakes">Cakes</option>
                  <option value="pastries">Ready to order</option>
                  <option value="ready-to-bake">Ready to bake</option>
                </Select>
              </>
            )}
            <Input label="Placed from" type="date" value={draft.from} onChange={(e) => edit("from", e.target.value)} />
            <Input
              label="Placed through"
              type="date"
              value={draft.to}
              min={draft.from || undefined}
              onChange={(e) => edit("to", e.target.value)}
            />
            <Select label="Per page" value={draft.size} onChange={(e) => edit("size", e.target.value)}>
              {[25, 50, 100].map((size) => (
                <option key={size}>{size}</option>
              ))}
            </Select>
            <div className="hw-filter-actions">
              <Button type="submit">Apply filters</Button>
              <Button variant="ghost" onClick={() => navigate({ ...defaults }, true)}>
                Reset
              </Button>
            </div>
          </div>
        )}
      </form>
      <div className="hw-results" aria-busy={loading}>
        {loading && !page ? (
          <div className="hw-skeleton" role="status" aria-label="Loading">
            {["one", "two", "three", "four", "five"].map((key) => (
              <span key={key} />
            ))}
          </div>
        ) : error ? (
          <div className="hw-error" role="alert">
            <p>{error}</p>
            <Button onClick={() => setRevision((v) => v + 1)}>Retry</Button>
          </div>
        ) : (
          <>
            <p className="hw-summary" role="status">
              {page?.total ?? 0} matching {kind === "orders" ? "orders" : "requests"}.
              {loading && <span> Updating…</span>}
            </p>
            {!page?.rows.length ? (
              <EmptyState title="Nothing here" body="Try another tab or reset your filters." />
            ) : (
              <ul className="hw-list">
                {page.rows.map((row) => {
                  const step = kind === "orders" ? nextStep(row) : null;
                  const selectable =
                    kind === "orders" &&
                    ["PAID", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"].includes(row.status);
                  const placed = ago(row.createdAt);
                  return (
                    <li key={row.id} className={selection[row.id] ? "is-selected" : ""}>
                      <span className="hw-check">
                        {selectable && (
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
                        )}
                      </span>
                      <button
                        type="button"
                        className="hw-open"
                        aria-label={`Open ${row.number}, ${row.customer}`}
                        onClick={() => openRow(row)}
                      >
                        {row.thumbnailUrl && (
                          <Image
                            width={44}
                            height={44}
                            unoptimized
                            className="hw-thumb"
                            src={row.thumbnailUrl}
                            alt=""
                            loading="lazy"
                          />
                        )}
                        <span className="hw-who">
                          <b>{row.customer}</b>
                          <small>
                            {row.number} ·{" "}
                            {kind === "cakes"
                              ? row.occasion || "Custom cake"
                              : `${row.items ?? 0} item${row.items === 1 ? "" : "s"} · ${row.fulfilment === "pickup" ? "Pickup" : row.fulfilment === "delivery" ? "Delivery" : "—"}`}
                          </small>
                        </span>
                        <span className="hw-when">
                          {row.deadline ? (
                            <>
                              <b>Due {row.deadline}</b>
                              <small>
                                Placed {placed || formatDate(row.createdAt, business.locale, business.timezone)}
                              </small>
                            </>
                          ) : (
                            <>
                              <b>{placed || formatDate(row.createdAt, business.locale, business.timezone)}</b>
                              <small>{formatDate(row.createdAt, business.locale, business.timezone)}</small>
                            </>
                          )}
                        </span>
                        <span className="hw-state history-status">
                          <em className={`hw-pill is-${stageTone[row.status] ?? "quiet"}`}>{label(row.status)}</em>
                          {row.paymentStatus && row.paymentStatus !== "SUCCEEDED" && (
                            <em className={`hw-pill is-${paymentTone[row.paymentStatus] ?? "quiet"} is-soft`}>
                              {label(row.paymentStatus)}
                            </em>
                          )}
                        </span>
                        <b className="hw-total">
                          {row.total === null
                            ? "Quote needed"
                            : formatMoney(row.total, row.currency || business.currency, business.locale)}
                        </b>
                      </button>
                      <span className="hw-action">
                        {step && (
                          <button
                            type="button"
                            className={`hw-step${armed === row.id ? " is-armed" : ""}`}
                            disabled={advancing === row.id || bulkBusy}
                            onClick={() => void advanceRow(row)}
                          >
                            {advancing === row.id
                              ? "Saving…"
                              : armed === row.id
                                ? `Tap to ${step.toLowerCase()}`
                                : step}
                          </button>
                        )}
                        <Icon name="chevron" className="hw-go" />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {lastPage > 1 && (
              <div className="hw-pagination">
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
            )}
          </>
        )}
      </div>
      {kind === "orders" && (Object.keys(selection).length > 0 || bulkResults.length > 0) && (
        <section className="hw-bulk" aria-label="Selected orders">
          {Object.keys(selection).length > 0 && (
            <>
              <b>{Object.keys(selection).length} selected</b>
              <Button disabled={loading || bulkBusy} onClick={advanceSelected}>
                {bulkBusy ? "Updating…" : `Advance selected (${Object.keys(selection).length})`}
              </Button>
              <Button variant="ghost" onClick={() => setSelection({})}>
                Clear
              </Button>
            </>
          )}
          {bulkResults.length > 0 && (
            <ul role="status">
              {bulkResults.map((result) => (
                <li key={result.number}>
                  {result.number} · {result.outcome}: {result.message}
                </li>
              ))}
              <li>
                <button type="button" className="text-button" onClick={() => setBulkResults([])}>
                  Dismiss
                </button>
              </li>
            </ul>
          )}
        </section>
      )}
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

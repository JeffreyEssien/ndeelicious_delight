"use client";
import { confirmSectionChange, useUnsavedChanges } from "./use-unsaved-changes";
import { HistoryWorkspace } from "./history-workspace";
import { BusinessDocument, type BusinessDocumentData } from "@/components/documents/business-document";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import { CakeTypesEditor } from "./cake-types-editor";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminCakeRequest, AdminCategory, AdminCoupon, AdminReview } from "@/lib/data/admin";
import type { Product } from "@/types";
import { Badge, Button, EmptyState, Input } from "@/components/ui/primitives";
import { useBusinessSettings, useToast } from "@/components/providers";
import type { CakeConfigurationData, CakeOption, CakeOptionType } from "@/types/content";

async function mutate(body: unknown) {
  return fetch("/api/admin/mutate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function CakeRequests({
  initial,
  detailOnly = false,
  onRefresh,
}: {
  initial: AdminCakeRequest[];
  detailOnly?: boolean;
  onRefresh?: () => Promise<void>;
}) {
  const router = useRouter();
  const { currency } = useBusinessSettings();
  const [items, setItems] = useState(initial);
  const [selected, setSelected] = useState(initial[0]);
  const [amount, setAmount] = useState(selected?.quotedTotal ? String(selected.quotedTotal / 100) : "");
  const [filter, setFilter] = useState("OPEN");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<BusinessDocumentData>();
  const [previewedAmount, setPreviewedAmount] = useState<number>();
  const [saveState, setSaveState] = useState<"idle" | "changed" | "saving" | "queued" | "error">("idle");
  const notify = useToast();
  useUnsavedChanges(saveState === "changed" || saveState === "error");
  useEffect(() => {
    setItems(initial);
    setSelected((current) => initial.find((item) => item.id === current?.id) ?? initial[0]);
  }, [initial]);
  useEffect(() => {
    if (!["PENDING", "SENDING"].includes(selected?.quoteDelivery?.status ?? "")) return;
    const timer = window.setInterval(() => {
      if (onRefresh) void onRefresh();
      else router.refresh();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [router, onRefresh, selected?.quoteDelivery?.status]);
  if (!selected) return <EmptyState title="No cake requests" body="New customer requests will appear here." />;
  async function previewQuote() {
    if (busy || !Number(amount)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/cakes/${selected.id}/quote-preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quotedTotal: Math.round(Number(amount) * 100) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setPreview(payload);
      setPreviewedAmount(Math.round(Number(amount) * 100));
    } catch (error) {
      notify(error instanceof Error ? error.message : "Quote preview could not be loaded. Retry.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (busy) return;
    setBusy(true);
    setSaveState("saving");
    const selectedId = selected.id;
    const quotedTotal = Math.round(Number(amount) * 100);
    try {
      const response = await mutate({ action: "cake-quote", id: selectedId, quotedTotal });
      const payload = await response.json().catch(() => null);
      setBusy(false);
      if (response.ok) {
        setItems((v) =>
          v.map((item) =>
            item.id === selectedId
              ? {
                  ...item,
                  quotedTotal,
                  quoteDelivery: payload?.documentId
                    ? { documentId: payload.documentId, status: "PENDING", attempts: 0, lastError: null }
                    : item.quoteDelivery,
                }
              : item,
          ),
        );
        setSelected((v) =>
          v
            ? {
                ...v,
                quotedTotal,
                quoteDelivery: payload?.documentId
                  ? { documentId: payload.documentId, status: "PENDING", attempts: 0, lastError: null }
                  : v.quoteDelivery,
              }
            : v,
        );
        setSaveState("queued");
        notify("Quote saved and queued for email.");
      } else {
        setSaveState("error");
        notify("Quote could not be sent.");
      }
    } catch {
      setSaveState("error");
      notify("Quote could not be sent. Retry after checking the delivery state.");
    } finally {
      setBusy(false);
    }
  }

  async function retryQuoteEmail() {
    if (!selected.quoteDelivery || busy) return;
    setBusy(true);
    try {
      const response = await mutate({
        action: "cake-quote-retry",
        id: selected.id,
        documentId: selected.quoteDelivery.documentId,
      });
      if (!response.ok) throw new Error("Quote email could not be queued again.");
      const quoteDelivery = { ...selected.quoteDelivery, status: "PENDING" as const, lastError: null };
      setItems((current) => current.map((item) => (item.id === selected.id ? { ...item, quoteDelivery } : item)));
      setSelected((current) => (current ? { ...current, quoteDelivery } : current));
      setSaveState("queued");
      notify("Quote email queued again.");
      if (onRefresh) await onRefresh();
    } catch {
      notify("Quote email could not be queued again. Check its delivery state and retry.");
    } finally {
      setBusy(false);
    }
  }
  async function changeStatus(status: string) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await mutate({ action: "cake-status", id: selected.id, status });
      if (!response.ok) throw new Error("Status update failed.");
      setItems((current) => current.map((item) => (item.id === selected.id ? { ...item, status } : item)));
      setSelected((current) => (current ? { ...current, status } : current));
      notify("Cake request updated.");
      if (onRefresh) await onRefresh();
    } catch {
      notify("Cake request status could not be updated. Refresh and retry.");
    } finally {
      setBusy(false);
    }
  }
  const visible = items.filter((item) =>
    filter === "ALL"
      ? true
      : filter === "OPEN"
        ? !["DELIVERED", "CANCELLED"].includes(item.status)
        : item.status === filter,
  );
  return (
    <div className="cake-request-workspace">
      {preview && (
        <ModalOverlay
          open
          onClose={() => setPreview(undefined)}
          className="admin-drawer history-detail"
          scrimClassName="admin-scrim"
          ariaLabel="Quotation preview"
        >
          <Button variant="secondary" onClick={() => setPreview(undefined)}>
            Back to request
          </Button>
          <BusinessDocument {...preview} showToolbar={false} />
        </ModalOverlay>
      )}
      {detailOnly && selected.communications && selected.communications.length > 0 && (
        <details className="admin-card cake-communication-history">
          <summary>Communication history</summary>
          <ol className="order-timeline">
            {selected.communications.map((message) => (
              <li key={message.id}>
                <b>
                  Quote revision {message.revision} · {message.status.toLowerCase().replaceAll("_", " ")}
                </b>
                <p>
                  {message.createdAt ? new Date(message.createdAt).toLocaleString() : "Date unavailable"} ·{" "}
                  {message.attempts} delivery attempts
                </p>
                {message.lastError && <p role="status">{message.lastError}</p>}
              </li>
            ))}
          </ol>
        </details>
      )}

      {!detailOnly && (
        <>
          <div className="cake-request-summary">
            <span>
              <b>{items.filter((item) => item.status === "QUOTE_REQUIRED").length}</b> need a quote
            </span>
            <span>
              <b>
                {items.filter((item) => ["CUSTOMER_APPROVED", "CONFIRMED", "PREPARING"].includes(item.status)).length}
              </b>{" "}
              being planned
            </span>
            <span>
              <b>{items.filter((item) => item.status === "READY").length}</b> ready
            </span>
          </div>
          <fieldset className="cake-request-filters" aria-label="Filter cake requests">
            {["OPEN", "QUOTE_REQUIRED", "READY", "ALL"].map((item) => (
              <button
                key={item}
                type="button"
                className={filter === item ? "active" : ""}
                onClick={() => setFilter(item)}
              >
                {item === "OPEN"
                  ? "Open requests"
                  : item === "QUOTE_REQUIRED"
                    ? "Needs quote"
                    : item === "READY"
                      ? "Ready"
                      : "All"}
              </button>
            ))}
          </fieldset>
        </>
      )}
      <div className={detailOnly ? "cake-request-detail-only" : "admin-split cake-request-split"}>
        {!detailOnly && (
          <div className="admin-card request-list">
            {!visible.length && <p className="admin-empty-copy">No requests match this view.</p>}
            {visible.map((item) => (
              <button
                type="button"
                className={item.id === selected.id ? "selected" : ""}
                key={item.id}
                onClick={() => {
                  setSelected(item);
                  setAmount(item.quotedTotal ? String(item.quotedTotal / 100) : "");
                  setSaveState("idle");
                }}
              >
                <span className="avatar">
                  {item.customerName
                    .split(" ")
                    .map((x) => x[0])
                    .join("")
                    .slice(0, 2)}
                </span>
                <div>
                  <b>
                    {item.requestNumber} · {item.customerName}
                  </b>
                  <small>
                    {item.configuration.occasion} · {item.configuration.size} · {item.requestedDate}
                  </small>
                </div>
                <Badge tone={item.status === "QUOTE_REQUIRED" ? "warning" : "success"}>
                  {item.status.replaceAll("_", " ")}
                </Badge>
              </button>
            ))}
          </div>
        )}
        <div className="admin-card request-detail">
          <span className="overline">
            {selected.requestNumber} · {selected.status.replaceAll("_", " ")}
          </span>
          <h2>
            {selected.configuration.occasion} cake for {selected.customerName}
          </h2>
          <dl>
            {["cakeType", "minimumLeadTime", "size", "flavour", "filling", "design", "colours"].map((key) => (
              <div key={key}>
                <dt>
                  {
                    {
                      cakeType: "Cake",
                      minimumLeadTime: "Preparation time",
                      size: "Size",
                      flavour: "Cake flavour",
                      filling: "Filling",
                      design: "Design",
                      colours: "Preferred colours",
                    }[key]
                  }
                </dt>
                <dd>{selected.configuration[key] || "—"}</dd>
              </div>
            ))}
            <div>
              <dt>Date</dt>
              <dd>{selected.requestedDate}</dd>
            </div>
          </dl>
          {selected.referenceUrls.length > 0 && (
            <div>
              <b>Inspiration</b>
              <div className="cake-reference-grid">
                {selected.referenceUrls.map((url) => (
                  // The signed URL is short-lived and only generated inside an authenticated admin page.
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    {/* biome-ignore lint/performance/noImgElement: private signed URLs should not pass through a public image optimizer. */}
                    <img src={url} alt="Customer cake inspiration — open full size" />
                  </a>
                ))}
              </div>
            </div>
          )}
          {selected.orderId ? (
            <p className="cake-quote-summary">
              Agreed quote:{" "}
              <strong>
                {new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(
                  (selected.quotedTotal ?? 0) / 100,
                )}
              </strong>
            </p>
          ) : (
            <Input
              label={`Quote amount (${currency})`}
              disabled={busy || Boolean(selected.orderId)}
              min="0.01"
              step="0.01"
              type="number"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setSaveState("changed");
              }}
            />
          )}
          <p>
            {selected.email} · {selected.phone}
          </p>
          {selected.customerNote && <p className="cake-customer-note">“{selected.customerNote}”</p>}
          <div className="cake-request-actions">
            <Button
              variant="secondary"
              disabled={busy || !Number(amount) || Boolean(selected.orderId)}
              onClick={previewQuote}
            >
              Preview quote
            </Button>
            <Button
              disabled={
                !Number(amount) ||
                busy ||
                saveState === "idle" ||
                Boolean(selected.orderId) ||
                previewedAmount !== Math.round(Number(amount) * 100)
              }
              onClick={save}
            >
              {busy ? "Sending…" : selected.quotedTotal ? "Send revised quote" : "Send quote"}
            </Button>
            {selected.quotedTotal && (
              <a
                className="button button-secondary"
                href={`/admin/documents/cakes/${encodeURIComponent(selected.requestNumber)}/quote`}
                target="_blank"
                rel="noreferrer"
              >
                View quote
              </a>
            )}
            {selected.quoteDelivery?.status === "FAILED" && (
              <Button variant="secondary" disabled={busy} onClick={retryQuoteEmail}>
                Retry quote email
              </Button>
            )}
            <label className="field">
              <span>Request stage</span>
              <select
                value={selected.status}
                disabled={Boolean(selected.orderId)}
                onChange={(event) => changeStatus(event.target.value)}
              >
                <option value="QUOTE_REQUIRED">Needs quote</option>
                <option value="QUOTE_SENT">Quote sent</option>
                <option value="CUSTOMER_APPROVED">Customer approved</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="PREPARING">In preparation</option>
                <option value="READY">Ready</option>
                <option value="OUT_FOR_DELIVERY">Out for delivery</option>
                <option value="DELIVERED">Delivered</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </label>
          </div>
          {selected.orderId && (
            <p className="admin-inline-state">
              This cake is linked to an order.{" "}
              <a
                href={
                  selected.orderNumber
                    ? `/admin/orders?detail=${encodeURIComponent(selected.orderNumber)}`
                    : "/admin/orders"
                }
              >
                Manage {selected.orderNumber || "the order"}
              </a>{" "}
              to update production and fulfilment.
            </p>
          )}
          {selected.quoteDelivery && (
            <p className="admin-inline-state" role="status">
              Email:{" "}
              {selected.quoteDelivery.status === "PENDING" ? "Queued" : selected.quoteDelivery.status.toLowerCase()}
              {selected.quoteDelivery.status === "FAILED" && " — delivery failed; retry when ready."}
            </p>
          )}
          <p className="admin-inline-state" role="status">
            {saveState === "changed" && "Unsaved quote amount"}
            {saveState === "saving" && "Issuing and emailing quote…"}
            {saveState === "queued" &&
              (selected.quoteDelivery?.status === "SENT"
                ? "Quote email sent."
                : selected.quoteDelivery?.status === "FAILED"
                  ? "Quote saved. Email delivery failed; use Retry quote email."
                  : "Quote saved. Email queued for delivery.")}
            {saveState === "error" && "Quote was not sent. Try again."}
          </p>
        </div>
      </div>
    </div>
  );
}

const optionTypes: CakeOptionType[] = ["occasion", "size", "flavour", "filling", "design"];

export function CakeConfigurationEditor({ initial }: { initial: CakeConfigurationData }) {
  const router = useRouter();
  const { currency } = useBusinessSettings();
  const [options, setOptions] = useState(initial.options);
  const [selectedType, setSelectedType] = useState<CakeOptionType>("occasion");
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "unsaved" | "saving" | "failed">("saved");
  const notify = useToast();
  useUnsavedChanges(saveState !== "saved");
  function update(index: number, values: Partial<CakeOption>) {
    setOptions((current) =>
      current.map((option, itemIndex) => (itemIndex === index ? { ...option, ...values } : option)),
    );
    setSaveState("unsaved");
  }
  function moveChoice(index: number, offset: number) {
    const positions = options.map((option, i) => (option.type === selectedType ? i : -1)).filter((i) => i >= 0);
    const destination = positions[positions.indexOf(index) + offset];
    if (destination === undefined) return;
    setOptions((current) => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
    setSaveState("unsaved");
  }
  async function save() {
    setBusy(true);
    setSaveState("saving");
    const normalized = options.map((option) => ({
      ...option,
      sortOrder: options.filter((item) => item.type === option.type).findIndex((item) => item.id === option.id),
    }));
    try {
      const response = await mutate({ action: "cake-options", options: normalized });
      setBusy(false);
      if (response.ok) {
        setSaveState("saved");
        notify("Cake configuration saved.");
        router.refresh();
      } else {
        setSaveState("failed");
        const payload = await response.json().catch(() => null);
        notify(payload?.error ?? "Cake configuration could not be saved.");
      }
    } catch {
      setSaveState("failed");
      notify("Options could not be saved. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-card form-stack">
      <div className="card-head">
        <div>
          <h2>Sizes, flavours and cake options</h2>
          <p role="status">
            {saveState === "saved"
              ? "All options are saved."
              : saveState === "saving"
                ? "Saving changes…"
                : saveState === "failed"
                  ? "Save failed — retry."
                  : "You have unsaved option changes."}
          </p>
        </div>
        <Button disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save options"}
        </Button>
      </div>
      <fieldset disabled={busy} className="form-stack" style={{ border: 0, padding: 0 }}>
        <div className="cake-option-types" role="tablist" aria-label="Cake option type">
          {optionTypes.map((type) => (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={selectedType === type}
              className={selectedType === type ? "active" : ""}
              onClick={() => setSelectedType(type)}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
              <span>{options.filter((option) => option.type === type && option.active).length}</span>
            </button>
          ))}
        </div>
        <div className="cake-option-list">
          {options.map((option, index) =>
            option.type === selectedType ? (
              <article key={option.id}>
                <div className="cake-option-main">
                  <Input
                    label="Option name"
                    value={option.name}
                    onChange={(event) => update(index, { name: event.target.value })}
                  />
                  <Input
                    label="Customer description"
                    value={option.description}
                    onChange={(event) => update(index, { description: event.target.value })}
                  />
                  <Input
                    label={`Extra charge (${currency})`}
                    type="number"
                    min="0"
                    value={option.priceAdjustment / 100}
                    onChange={(event) =>
                      update(index, { priceAdjustment: Math.round(Number(event.target.value) * 100) })
                    }
                  />
                </div>
                <div className="cake-option-controls">
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy || !options.slice(0, index).some((item) => item.type === selectedType)}
                    onClick={() => moveChoice(index, -1)}
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy || !options.slice(index + 1).some((item) => item.type === selectedType)}
                    onClick={() => moveChoice(index, 1)}
                  >
                    Move down
                  </button>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={option.active}
                      onChange={(event) => update(index, { active: event.target.checked })}
                    />
                    <span>Available to customers</span>
                  </label>
                  <details>
                    <summary>Quote rules</summary>{" "}
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={option.quoteRequired}
                        onChange={(event) => update(index, { quoteRequired: event.target.checked })}
                      />
                      <span>Needs a custom quote</span>
                    </label>
                  </details>
                  <button
                    type="button"
                    className="text-button danger-text"
                    onClick={() => {
                      setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index));
                      setSaveState("unsaved");
                    }}
                  >
                    Remove option
                  </button>
                </div>
              </article>
            ) : null,
          )}
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            setSaveState("unsaved");
            setOptions((current) => [
              ...current,
              {
                id: crypto.randomUUID(),
                type: selectedType,
                name: "",
                description: "",
                priceAdjustment: 0,
                quoteRequired: false,
                active: true,
                sortOrder: current.length,
              },
            ]);
          }}
        >
          Add option
        </Button>
      </fieldset>
    </div>
  );
}

export function CakeWorkspace({
  configuration,
}: {
  requests: AdminCakeRequest[];
  configuration: CakeConfigurationData;
}) {
  const [view, setView] = useState<"requests" | "options">("requests");
  return (
    <div className="cake-workspace">
      <div className="admin-section-tabs" role="tablist" aria-label="Custom cake workspace">
        <button
          type="button"
          role="tab"
          aria-selected={view === "requests"}
          className={view === "requests" ? "active" : ""}
          onClick={() => {
            if (confirmSectionChange()) setView("requests");
          }}
        >
          Customer requests
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "options"}
          className={view === "options" ? "active" : ""}
          onClick={() => {
            if (confirmSectionChange()) setView("options");
          }}
        >
          My cakes & options (Configuration){" "}
          <span>{configuration.options.filter((option) => option.active).length}</span>
        </button>
      </div>
      {view === "requests" ? (
        <HistoryWorkspace<AdminCakeRequest>
          kind="cakes"
          renderDetail={(request, _close, refresh) => (
            <CakeRequests initial={[request]} detailOnly onRefresh={refresh} />
          )}
        />
      ) : (
        <>
          <CakeTypesEditor
            initial={configuration.cakeTypes}
            options={configuration.options}
            relationships={configuration.relationships ?? []}
          />
          <CakeConfigurationEditor initial={configuration} />
        </>
      )}
    </div>
  );
}

export function Coupons({
  initial,
  products,
  categories,
}: {
  initial: AdminCoupon[];
  products: Product[];
  categories: AdminCategory[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "unsaved" | "saving" | "failed">("saved");
  const notify = useToast();
  function update(index: number, values: Partial<AdminCoupon>) {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...values } : item)));
    setSaveState("unsaved");
  }
  async function save() {
    if (items.some((item) => item.code.trim().length < 2 || item.value <= 0)) {
      notify("Give every coupon a code and a valid discount value.");
      return;
    }
    if (items.some((item) => item.startsAt && item.expiresAt && item.startsAt >= item.expiresAt)) {
      notify("Each coupon expiry must be later than its start date.");
      return;
    }
    setBusy(true);
    setSaveState("saving");
    const response = await mutate({ action: "coupons", coupons: items });
    setBusy(false);
    if (response.ok) {
      const payload = await response.json();
      setItems((current) => current.map((item) => ({ ...item, id: payload.savedIds?.[item.id] ?? item.id })));
      setSaveState("saved");
      notify("Coupons saved.");
      router.refresh();
    } else {
      setSaveState("failed");
      const payload = await response.json().catch(() => null);
      notify(payload?.error ?? "Coupons could not be saved.");
    }
  }
  return (
    <>
      <div className="admin-page-head compact">
        <span className="document-save-state" role="status">
          {saveState === "saved"
            ? "Saved"
            : saveState === "saving"
              ? "Saving…"
              : saveState === "failed"
                ? "Failed — retry"
                : "Unsaved changes"}
        </span>
        <Button
          variant="secondary"
          onClick={() => {
            setSaveState("unsaved");
            setItems((current) => [
              ...current,
              {
                id: `new-${Date.now()}`,
                code: "",
                type: "PERCENTAGE",
                value: 10,
                minimumOrder: 0,
                maximumDiscount: null,
                usageLimit: null,
                perCustomerLimit: null,
                active: false,
                startsAt: null,
                expiresAt: null,
                productIds: [],
                categoryIds: [],
                usageCount: 0,
              },
            ]);
          }}
        >
          New coupon
        </Button>
        <Button disabled={busy || !items.length} onClick={save}>
          {busy ? "Saving…" : "Save coupons"}
        </Button>
      </div>
      <div className="admin-card table-scroll mobile-card-table coupons-table">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Eligibility</th>
              <th>Uses</th>
              <th>Code</th>
              <th>Offer</th>
              <th>Minimum</th>
              <th>Max discount</th>
              <th>Total limit</th>
              <th>Per customer</th>
              <th>Starts</th>
              <th>Expires</th>
              <th>Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!items.length && (
              <tr>
                <td colSpan={12}>No coupons yet. Use “New coupon” to create the first promotion.</td>
              </tr>
            )}
            {items.map((item, index) => (
              <tr key={item.id}>
                <td data-label="Eligibility">
                  <details className="coupon-restrictions">
                    <summary>
                      {item.productIds.length || item.categoryIds.length ? "Restricted" : "All products"}
                    </summary>
                    <fieldset>
                      <legend>Categories</legend>
                      {categories.map((category) => (
                        <label key={category.id}>
                          <input
                            type="checkbox"
                            checked={item.categoryIds.includes(category.id)}
                            onChange={(event) =>
                              update(index, {
                                categoryIds: event.target.checked
                                  ? [...item.categoryIds, category.id]
                                  : item.categoryIds.filter((id) => id !== category.id),
                              })
                            }
                          />
                          {category.name}
                        </label>
                      ))}
                    </fieldset>
                    <fieldset>
                      <legend>Specific products</legend>
                      {products.map((product) => (
                        <label key={product.id}>
                          <input
                            type="checkbox"
                            checked={item.productIds.includes(product.id)}
                            onChange={(event) =>
                              update(index, {
                                productIds: event.target.checked
                                  ? [...item.productIds, product.id]
                                  : item.productIds.filter((id) => id !== product.id),
                              })
                            }
                          />
                          {product.name}
                        </label>
                      ))}
                    </fieldset>
                    <small>
                      Leave both groups empty for every product. When both are selected, products must match both.
                    </small>
                  </details>
                </td>
                <td data-label="Uses">{item.usageCount}</td>
                <td data-label="Code">
                  <input
                    aria-label="Coupon code"
                    value={item.code}
                    onChange={(event) => update(index, { code: event.target.value.toUpperCase() })}
                  />
                </td>
                <td data-label="Offer">
                  <select
                    aria-label="Coupon type"
                    value={item.type}
                    onChange={(event) => {
                      const type = event.target.value as AdminCoupon["type"];
                      update(index, {
                        type,
                        value:
                          type === "PERCENTAGE"
                            ? Math.min(100, item.type === "FIXED" ? 10 : item.value)
                            : item.type === "PERCENTAGE"
                              ? item.value * 100
                              : item.value,
                      });
                    }}
                  >
                    <option value="PERCENTAGE">Percentage</option>
                    <option value="FIXED">Fixed amount</option>
                  </select>
                  <input
                    aria-label="Coupon value"
                    type="number"
                    min="1"
                    max={item.type === "PERCENTAGE" ? 100 : undefined}
                    value={item.type === "PERCENTAGE" ? item.value : item.value / 100}
                    onChange={(event) =>
                      update(index, {
                        value: Math.max(0, Number(event.target.value) * (item.type === "PERCENTAGE" ? 1 : 100)),
                      })
                    }
                  />
                </td>
                <td data-label="Minimum order (CAD)">
                  <MoneyInput
                    label="Minimum order"
                    value={item.minimumOrder}
                    onChange={(value) => update(index, { minimumOrder: value ?? 0 })}
                  />
                </td>
                <td data-label="Maximum discount (CAD)">
                  <MoneyInput
                    label="Maximum discount"
                    value={item.maximumDiscount}
                    onChange={(value) => update(index, { maximumDiscount: value })}
                  />
                </td>
                <td data-label="Total usage limit">
                  <OptionalNumber
                    label="Total usage limit"
                    value={item.usageLimit}
                    onChange={(value) => update(index, { usageLimit: value })}
                  />
                </td>
                <td data-label="Per customer">
                  <OptionalNumber
                    label="Per customer limit"
                    value={item.perCustomerLimit}
                    onChange={(value) => update(index, { perCustomerLimit: value })}
                  />
                </td>
                <td data-label="Starts">
                  <DateTimeInput
                    label="Coupon start"
                    value={item.startsAt}
                    onChange={(startsAt) => update(index, { startsAt })}
                  />
                </td>
                <td data-label="Expires">
                  <DateTimeInput
                    label="Coupon expiry"
                    value={item.expiresAt}
                    onChange={(expiresAt) => update(index, { expiresAt })}
                  />
                </td>
                <td data-label="Active">
                  <input
                    aria-label="Coupon active"
                    type="checkbox"
                    checked={item.active}
                    onChange={(event) => update(index, { active: event.target.checked })}
                  />
                </td>
                <td data-label="Actions">
                  {item.id.startsWith("new-") && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setItems((v) => v.filter((_, i) => i !== index))}
                    >
                      Discard
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MoneyInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <input
      aria-label={`${label} in CAD`}
      type="number"
      min="0"
      value={value === null ? "" : value / 100}
      onChange={(event) => onChange(event.target.value === "" ? null : Math.round(Number(event.target.value) * 100))}
    />
  );
}

function OptionalNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <input
      aria-label={label}
      type="number"
      min="1"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
    />
  );
}

function DateTimeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <input
      aria-label={label}
      type="datetime-local"
      value={value ? value.slice(0, 16) : ""}
      onChange={(event) => onChange(event.target.value ? new Date(event.target.value).toISOString() : null)}
    />
  );
}

export function Reviews({ initial }: { initial: AdminReview[] }) {
  const [items, setItems] = useState(initial);
  const notify = useToast();
  async function update(id: string, status: "APPROVED" | "REJECTED") {
    const response = await mutate({ action: "review-status", id, status });
    if (response.ok) {
      setItems((v) => v.map((item) => (item.id === id ? { ...item, status } : item)));
      notify(`Review ${status.toLowerCase()}.`);
    } else notify("Review could not be updated.");
  }
  if (!items.length) return <EmptyState title="No reviews yet" body="Customer reviews will appear here." />;
  return (
    <div className="review-admin-grid">
      {items.map((item) => (
        <article className="admin-card" key={item.id}>
          <Badge tone={item.status === "PENDING" ? "warning" : "success"}>{item.status}</Badge>
          <span className="stars">{"★".repeat(item.rating)}</span>
          <h3>{item.title || item.body}</h3>
          <p>
            {item.productName} · {item.customerName}
          </p>
          <small>{item.verifiedPurchase ? "✓ Purchase verified" : "Legacy unverified review · cannot publish"}</small>
          <div>
            <Button variant="secondary" disabled={!item.verifiedPurchase} onClick={() => update(item.id, "APPROVED")}>
              Approve
            </Button>
            <Button variant="ghost" onClick={() => update(item.id, "REJECTED")}>
              Reject
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}

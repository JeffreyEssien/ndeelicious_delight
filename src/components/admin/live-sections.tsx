"use client";
import { useState } from "react";
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

export function CakeRequests({ initial }: { initial: AdminCakeRequest[] }) {
  const { currency } = useBusinessSettings();
  const [items, setItems] = useState(initial);
  const [selected, setSelected] = useState(initial[0]);
  const [amount, setAmount] = useState(selected?.quotedTotal ? String(selected.quotedTotal / 100) : "");
  const [filter, setFilter] = useState("OPEN");
  const notify = useToast();
  if (!selected) return <EmptyState title="No cake requests" body="New customer requests will appear here." />;
  async function save() {
    const selectedId = selected.id;
    const quotedTotal = Math.round(Number(amount) * 100);
    const response = await mutate({ action: "cake-quote", id: selectedId, quotedTotal });
    if (response.ok) {
      setItems((v) =>
        v.map((item) => (item.id === selectedId ? { ...item, status: "QUOTE_SENT", quotedTotal } : item)),
      );
      setSelected((v) => (v ? { ...v, status: "QUOTE_SENT", quotedTotal } : v));
      notify("Cake quote saved.");
    } else notify("Quote could not be saved.");
  }
  async function changeStatus(status: string) {
    const response = await mutate({ action: "cake-status", id: selected.id, status });
    if (!response.ok) {
      notify("Cake request status could not be updated.");
      return;
    }
    setItems((current) => current.map((item) => (item.id === selected.id ? { ...item, status } : item)));
    setSelected((current) => (current ? { ...current, status } : current));
    notify("Cake request updated.");
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
      <div className="cake-request-summary">
        <span>
          <b>{items.filter((item) => item.status === "QUOTE_REQUIRED").length}</b> need a quote
        </span>
        <span>
          <b>{items.filter((item) => ["CUSTOMER_APPROVED", "CONFIRMED", "PREPARING"].includes(item.status)).length}</b>{" "}
          being planned
        </span>
        <span>
          <b>{items.filter((item) => item.status === "READY").length}</b> ready
        </span>
      </div>
      <fieldset className="cake-request-filters" aria-label="Filter cake requests">
        {["OPEN", "QUOTE_REQUIRED", "READY", "ALL"].map((item) => (
          <button key={item} type="button" className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
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
      <div className="admin-split cake-request-split">
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
        <div className="admin-card request-detail">
          <span className="overline">
            {selected.requestNumber} · {selected.status.replaceAll("_", " ")}
          </span>
          <h2>
            {selected.configuration.occasion} cake for {selected.customerName}
          </h2>
          <dl>
            {["size", "flavour", "filling", "design", "colours"].map((key) => (
              <div key={key}>
                <dt>{key}</dt>
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
                  // biome-ignore lint/performance/noImgElement: private signed storage URLs are not Next image host allow-listed
                  <img key={url} src={url} alt="Customer cake inspiration" />
                ))}
              </div>
            </div>
          )}
          <Input
            label={`Quote amount (${currency})`}
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <p>
            {selected.email} · {selected.phone}
          </p>
          {selected.customerNote && <p className="cake-customer-note">“{selected.customerNote}”</p>}
          <div className="cake-request-actions">
            <Button disabled={!Number(amount)} onClick={save}>
              Save quote
            </Button>
            <label className="field">
              <span>Request stage</span>
              <select value={selected.status} onChange={(event) => changeStatus(event.target.value)}>
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
        </div>
      </div>
    </div>
  );
}

const optionTypes: CakeOptionType[] = ["occasion", "size", "flavour", "filling", "design"];

export function CakeConfigurationEditor({ initial }: { initial: CakeConfigurationData }) {
  const { currency } = useBusinessSettings();
  const [options, setOptions] = useState(initial.options);
  const [selectedType, setSelectedType] = useState<CakeOptionType>("occasion");
  const [busy, setBusy] = useState(false);
  const notify = useToast();
  function update(index: number, values: Partial<CakeOption>) {
    setOptions((current) =>
      current.map((option, itemIndex) => (itemIndex === index ? { ...option, ...values } : option)),
    );
  }
  async function save() {
    setBusy(true);
    const normalized = options.map((option) => ({
      ...option,
      sortOrder: options.filter((item) => item.type === option.type).findIndex((item) => item.id === option.id),
    }));
    const response = await mutate({ action: "cake-options", options: normalized });
    setBusy(false);
    if (response.ok) {
      notify("Cake configuration saved.");
      window.location.reload();
    } else {
      const payload = await response.json().catch(() => null);
      notify(payload?.error ?? "Cake configuration could not be saved.");
    }
  }
  return (
    <div className="admin-card form-stack">
      <div className="card-head">
        <div>
          <h2>Cake builder configuration</h2>
          <p>Live options, pricing adjustments, and quote rules.</p>
        </div>
        <Button disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save options"}
        </Button>
      </div>
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
                  label={`Price adjustment (${currency})`}
                  type="number"
                  min="0"
                  value={option.priceAdjustment / 100}
                  onChange={(event) => update(index, { priceAdjustment: Math.round(Number(event.target.value) * 100) })}
                />
              </div>
              <div className="cake-option-controls">
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={option.active}
                    onChange={(event) => update(index, { active: event.target.checked })}
                  />
                  <span>Available to customers</span>
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={option.quoteRequired}
                    onChange={(event) => update(index, { quoteRequired: event.target.checked })}
                  />
                  <span>Needs a custom quote</span>
                </label>
                <button
                  type="button"
                  className="text-button danger-text"
                  onClick={() => setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))}
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
        onClick={() =>
          setOptions((current) => [
            ...current,
            {
              id: `new-${Date.now()}`,
              type: selectedType,
              name: "",
              description: "",
              priceAdjustment: 0,
              quoteRequired: false,
              active: true,
              sortOrder: current.length,
            },
          ])
        }
      >
        Add option
      </Button>
    </div>
  );
}

export function CakeWorkspace({
  requests,
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
          onClick={() => setView("requests")}
        >
          Customer requests <span>{requests.filter((item) => item.status === "QUOTE_REQUIRED").length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "options"}
          className={view === "options" ? "active" : ""}
          onClick={() => setView("options")}
        >
          Cake builder options <span>{configuration.options.filter((option) => option.active).length}</span>
        </button>
      </div>
      {view === "requests" ? <CakeRequests initial={requests} /> : <CakeConfigurationEditor initial={configuration} />}
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
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  const notify = useToast();
  function update(index: number, values: Partial<AdminCoupon>) {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...values } : item)));
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
    const response = await mutate({ action: "coupons", coupons: items });
    setBusy(false);
    if (response.ok) {
      notify("Coupons saved.");
      window.location.reload();
    } else {
      const payload = await response.json().catch(() => null);
      notify(payload?.error ?? "Coupons could not be saved.");
    }
  }
  return (
    <>
      <div className="admin-page-head compact">
        <Button
          variant="secondary"
          onClick={() =>
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
            ])
          }
        >
          New coupon
        </Button>
        <Button disabled={busy || !items.length} onClick={save}>
          {busy ? "Saving…" : "Save coupons"}
        </Button>
      </div>
      <div className="admin-card table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Offer</th>
              <th>Minimum</th>
              <th>Max discount</th>
              <th>Total limit</th>
              <th>Per customer</th>
              <th>Starts</th>
              <th>Expires</th>
              <th>Eligibility</th>
              <th>Uses</th>
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
                <td>
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
                <td>{item.usageCount}</td>
                <td>
                  <input
                    aria-label="Coupon code"
                    value={item.code}
                    onChange={(event) => update(index, { code: event.target.value.toUpperCase() })}
                  />
                </td>
                <td>
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
                <td>
                  <MoneyInput
                    label="Minimum order"
                    value={item.minimumOrder}
                    onChange={(value) => update(index, { minimumOrder: value ?? 0 })}
                  />
                </td>
                <td>
                  <MoneyInput
                    label="Maximum discount"
                    value={item.maximumDiscount}
                    onChange={(value) => update(index, { maximumDiscount: value })}
                  />
                </td>
                <td>
                  <OptionalNumber
                    label="Total usage limit"
                    value={item.usageLimit}
                    onChange={(value) => update(index, { usageLimit: value })}
                  />
                </td>
                <td>
                  <OptionalNumber
                    label="Per customer limit"
                    value={item.perCustomerLimit}
                    onChange={(value) => update(index, { perCustomerLimit: value })}
                  />
                </td>
                <td>
                  <DateTimeInput
                    label="Coupon start"
                    value={item.startsAt}
                    onChange={(startsAt) => update(index, { startsAt })}
                  />
                </td>
                <td>
                  <DateTimeInput
                    label="Coupon expiry"
                    value={item.expiresAt}
                    onChange={(expiresAt) => update(index, { expiresAt })}
                  />
                </td>
                <td>
                  <input
                    aria-label="Coupon active"
                    type="checkbox"
                    checked={item.active}
                    onChange={(event) => update(index, { active: event.target.checked })}
                  />
                </td>
                <td>
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
      aria-label={`${label} in naira`}
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
          <div>
            <Button variant="secondary" onClick={() => update(item.id, "APPROVED")}>
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

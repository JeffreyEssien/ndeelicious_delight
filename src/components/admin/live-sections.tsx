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
  return (
    <div className="admin-split">
      <div className="admin-card request-list">
        {items.map((item) => (
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
        <Button disabled={!Number(amount)} onClick={save}>
          Save quote
        </Button>
      </div>
    </div>
  );
}

const optionTypes: CakeOptionType[] = ["occasion", "size", "flavour", "filling", "design"];

export function CakeConfigurationEditor({ initial }: { initial: CakeConfigurationData }) {
  const { currency } = useBusinessSettings();
  const [options, setOptions] = useState(initial.options);
  const [busy, setBusy] = useState(false);
  const notify = useToast();
  function update(index: number, values: Partial<CakeOption>) {
    setOptions((current) =>
      current.map((option, itemIndex) => (itemIndex === index ? { ...option, ...values } : option)),
    );
  }
  async function save() {
    setBusy(true);
    const response = await mutate({ action: "cake-options", options });
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
      <div className="table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Name</th>
              <th>Description</th>
              <th>Adjustment ({currency})</th>
              <th>Quote</th>
              <th>Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {options.map((option, index) => (
              <tr key={option.id}>
                <td>
                  <select
                    className="status-select"
                    value={option.type}
                    onChange={(event) => update(index, { type: event.target.value as CakeOptionType })}
                  >
                    {optionTypes.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input value={option.name} onChange={(event) => update(index, { name: event.target.value })} />
                </td>
                <td>
                  <input
                    value={option.description}
                    onChange={(event) => update(index, { description: event.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    value={option.priceAdjustment / 100}
                    onChange={(event) =>
                      update(index, { priceAdjustment: Math.round(Number(event.target.value) * 100) })
                    }
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={option.quoteRequired}
                    onChange={(event) => update(index, { quoteRequired: event.target.checked })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={option.active}
                    onChange={(event) => update(index, { active: event.target.checked })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button
        variant="secondary"
        onClick={() =>
          setOptions((current) => [
            ...current,
            {
              id: `new-${Date.now()}`,
              type: "occasion",
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

"use client";
import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import type { AdminCakeRequest, AdminCategory, AdminCoupon, AdminOrder, AdminReview } from "@/lib/data/admin";
import type { DeliveryZone, OrderStatus, Product, ProductStatus } from "@/types";
import { formatDate } from "@/lib/format";
import { Badge, Button, EmptyState, Input, Textarea } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icons";
import { CakeRequests, Coupons, Reviews } from "@/components/admin/live-sections";
import { CakeConfigurationEditor } from "@/components/admin/live-sections";
import { ProductEditor } from "@/components/admin/product-editor";
import { ContentSettings } from "@/components/admin/content-settings";
import { useBusinessSettings, useMoney, useStoreTheme, useToast, type StoreTheme } from "@/components/providers";
import type {
  BusinessSettings as BusinessSettingsData,
  CakeConfigurationData,
  StoreAppearance,
  StorefrontContent,
} from "@/types/content";

type Props = {
  section?: string;
  initialProducts: Product[];
  initialOrders: AdminOrder[];
  initialZones: DeliveryZone[];
  initialCakes: AdminCakeRequest[];
  initialCoupons: AdminCoupon[];
  initialCategories: AdminCategory[];
  initialReviews: AdminReview[];
  initialContent: StorefrontContent;
  initialBusiness: BusinessSettingsData;
  initialCakeConfiguration: CakeConfigurationData;
  initialAppearance: StoreAppearance;
};
const titles: Record<string, string> = {
  dashboard: "Bakery overview",
  orders: "Orders",
  "custom-cakes": "Custom cake requests",
  products: "Products",
  inventory: "Inventory",
  customers: "Customers",
  coupons: "Coupons & promotions",
  reviews: "Customer reviews",
  content: "Storefront content",
  delivery: "Delivery zones",
  settings: "Business settings",
};
const themes: { id: StoreTheme; name: string; description: string; colors: string[] }[] = [
  {
    id: "berry",
    name: "Berry Atelier",
    description: "Soft berry and warm neutrals",
    colors: ["#792f49", "#f1e2e7", "#c89b49"],
  },
  {
    id: "purple",
    name: "Royal Purple",
    description: "Pulled from the original logo",
    colors: ["#6516a3", "#eee0fa", "#c58b20"],
  },
  {
    id: "sunrise",
    name: "Orange & Yellow",
    description: "Inspired by the retail packaging",
    colors: ["#f05a1f", "#fff0d2", "#f4c430"],
  },
];
async function mutate(body: unknown) {
  return fetch("/api/admin/mutate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function AdminPortal({
  section = "dashboard",
  initialProducts,
  initialOrders,
  initialZones,
  initialCakes,
  initialCoupons,
  initialCategories,
  initialReviews,
  initialContent,
  initialBusiness,
  initialCakeConfiguration,
  initialAppearance,
}: Props) {
  const [products, setProducts] = useState(initialProducts);
  const [orders, setOrders] = useState(initialOrders);
  const [zones, setZones] = useState(initialZones);
  const [editor, setEditor] = useState<Product | null>();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [zoneBusy, setZoneBusy] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string>();
  const notify = useToast();
  const { theme, setTheme } = useStoreTheme();
  async function productStatus(id: string, value: ProductStatus) {
    const before = products;
    setProducts((v) => v.map((p) => (p.id === id ? { ...p, status: value } : p)));
    const response = await mutate({ action: "product-status", id, status: value });
    if (response.ok) notify("Product visibility updated.");
    else {
      setProducts(before);
      notify("Product update could not be saved.");
    }
  }
  async function duplicateProduct(product: Product) {
    const response = await fetch(`/api/admin/products/${product.id}`, { method: "POST" });
    const payload = await response.json();
    if (response.ok) {
      notify(`${product.name} duplicated as a draft.`);
      window.location.reload();
    } else notify(payload.error ?? "Product could not be duplicated.");
  }
  async function orderStatus(id: string, value: OrderStatus) {
    const before = orders;
    setOrders((v) => v.map((o) => (o.id === id ? { ...o, status: value } : o)));
    const response = await mutate({ action: "order-status", orderNumber: id, status: value });
    if (response.ok) notify("Order status updated.");
    else {
      setOrders(before);
      const payload = await response.json().catch(() => null);
      notify(payload?.error ?? "Order update could not be saved.");
    }
  }
  async function inventory(id: string, quantity: number) {
    const before = products;
    setProducts((v) =>
      v.map((p) =>
        p.id === id
          ? {
              ...p,
              stockQuantity: quantity,
              status: quantity === 0 ? "OUT_OF_STOCK" : p.status === "OUT_OF_STOCK" ? "ACTIVE" : p.status,
            }
          : p,
      ),
    );
    const response = await mutate({ action: "inventory", id, quantity });
    if (response.ok) notify("Inventory updated.");
    else {
      setProducts(before);
      const payload = await response.json().catch(() => null);
      notify(payload?.error ?? "Inventory could not be saved.");
    }
  }
  async function saveZones() {
    if (zones.some((zone) => zone.name.trim().length < 2 || zone.fee < 0 || zone.minimumOrder < 0)) {
      notify("Give every delivery zone a name, fee, and valid minimum order.");
      return;
    }
    setZoneBusy(true);
    const response = await mutate({ action: "delivery-zones", zones });
    setZoneBusy(false);
    if (response.ok) {
      notify("Delivery zones saved.");
      window.location.reload();
    } else notify("Delivery zones could not be saved.");
  }
  async function changeTheme(value: StoreTheme) {
    setTheme(value);
    const [themeResponse, appearanceResponse] = await Promise.all([
      mutate({ action: "theme", theme: value }),
      mutate({ action: "settings", key: "appearance", value: { ...initialAppearance, useCustomColors: false } }),
    ]);
    if (themeResponse.ok && appearanceResponse.ok) {
      notify("Storefront theme is now live.");
      window.location.reload();
    } else notify("Theme changed locally but could not be saved.");
  }
  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <span>Manage bakery</span>
          <h1>{titles[section] ?? "Dashboard"}</h1>
          {section === "dashboard" && <p>Live information from your connected store.</p>}
        </div>
        <div className="admin-head-actions">
          {section === "products" && (
            <Button onClick={() => setEditor(null)}>
              <Icon name="plus" /> Add product
            </Button>
          )}
          {section === "delivery" && (
            <>
              <Button
                variant="secondary"
                onClick={() =>
                  setZones((v) => [
                    ...v,
                    {
                      id: `new-${Date.now()}`,
                      name: "",
                      fee: 0,
                      minimumOrder: 0,
                      estimate: "",
                      active: false,
                    },
                  ])
                }
              >
                <Icon name="plus" /> Add zone
              </Button>
              <Button disabled={zoneBusy} onClick={saveZones}>
                {zoneBusy ? "Saving…" : "Save zones"}
              </Button>
            </>
          )}
        </div>
      </div>
      {section === "dashboard" && <Dashboard products={products} orders={orders} cakes={initialCakes} />}
      {section === "orders" && (
        <>
          <AdminFilters
            query={query}
            setQuery={setQuery}
            status={status}
            setStatus={setStatus}
            options={[
              "ALL",
              "PENDING_PAYMENT",
              "PAID",
              "CONFIRMED",
              "PREPARING",
              "READY",
              "OUT_FOR_DELIVERY",
              "DELIVERED",
              "CANCELLED",
            ]}
          />
          <div className="admin-card">
            <OrderTable
              orders={orders.filter(
                (o) =>
                  (status === "ALL" || o.status === status) &&
                  `${o.id} ${o.customer}`.toLowerCase().includes(query.toLowerCase()),
              )}
              onStatus={orderStatus}
              onView={(order) => setSelectedOrderId(order.id)}
            />
          </div>
        </>
      )}
      {section === "custom-cakes" && (
        <>
          <CakeConfigurationEditor initial={initialCakeConfiguration} />
          <CakeRequests initial={initialCakes} />
        </>
      )}
      {section === "products" && (
        <Products
          products={products}
          query={query}
          status={status}
          setQuery={setQuery}
          setStatus={setStatus}
          onStatus={productStatus}
          onEdit={setEditor}
          onDuplicate={duplicateProduct}
        />
      )}
      {section === "inventory" && <Inventory products={products} onChange={inventory} />}
      {section === "customers" && <Customers orders={orders} />}
      {section === "coupons" && <Coupons initial={initialCoupons} products={products} categories={initialCategories} />}
      {section === "reviews" && <Reviews initial={initialReviews} />}
      {section === "content" && <ContentSettings initial={initialContent} />}
      {section === "delivery" && <DeliveryZones zones={zones} setZones={setZones} />}
      {section === "settings" && (
        <BusinessSettings
          initial={initialBusiness}
          appearance={initialAppearance}
          theme={theme}
          changeTheme={changeTheme}
        />
      )}
      {editor !== undefined && (
        <>
          <button
            type="button"
            className="scrim admin-scrim"
            onClick={() => setEditor(undefined)}
            aria-label="Close product drawer"
          />
          <ProductEditor
            product={editor}
            close={() => setEditor(undefined)}
            onSaved={() => {
              setEditor(undefined);
              notify("Product saved. Storefront visibility is up to date.");
              window.location.reload();
            }}
          />
        </>
      )}
      {selectedOrderId && orders.find((order) => order.id === selectedOrderId) && (
        <OrderDetail
          order={orders.find((order) => order.id === selectedOrderId) as AdminOrder}
          close={() => setSelectedOrderId(undefined)}
          onStatus={orderStatus}
        />
      )}
    </div>
  );
}

function Dashboard({
  products,
  orders,
  cakes,
}: {
  products: Product[];
  orders: AdminOrder[];
  cakes: AdminCakeRequest[];
}) {
  const money = useMoney();
  const today = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.filter((o) => o.date.slice(0, 10) === today);
  const low = products.filter((p) => p.stockQuantity <= p.lowStockThreshold);
  return (
    <>
      <div className="metric-grid">
        <Metric
          label="Today’s revenue"
          value={money(
            todayOrders
              .filter((o) =>
                ["PAID", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"].includes(o.status),
              )
              .reduce((sum, o) => sum + o.total, 0),
          )}
          delta={`${todayOrders.length} orders today`}
        />
        <Metric label="Total orders" value={String(orders.length)} delta="Across the connected store" />
        <Metric
          label="Custom requests"
          value={String(cakes.length)}
          delta={`${cakes.filter((c) => c.status === "QUOTE_REQUIRED").length} need a quote`}
        />
        <Metric label="Low stock" value={String(low.length)} delta="Review inventory" />
      </div>
      <div className="dashboard-grid">
        <div className="admin-card">
          <div className="card-head">
            <div>
              <h2>Recent orders</h2>
              <p>Latest bakery activity</p>
            </div>
            <Link href="/admin/orders">View all</Link>
          </div>
          <OrderTable orders={orders.slice(0, 5)} />
        </div>
        <div className="admin-card attention-list">
          <div className="card-head">
            <div>
              <h2>Needs attention</h2>
              <p>Live operational signals</p>
            </div>
          </div>
          <article>
            <span className="attention-icon danger">!</span>
            <div>
              <b>{low.length} products are running low</b>
              <small>Update today’s quantities</small>
            </div>
          </article>
          <article>
            <span className="attention-icon warning">$</span>
            <div>
              <b>{cakes.filter((c) => c.status === "QUOTE_REQUIRED").length} cake quotes waiting</b>
              <small>Open custom cake requests</small>
            </div>
          </article>
        </div>
      </div>
    </>
  );
}
function Metric({ label, value, delta }: { label: string; value: string; delta: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <b>{value}</b>
      <small>{delta}</small>
    </div>
  );
}
function OrderTable({
  orders,
  onStatus,
  onView,
}: {
  orders: AdminOrder[];
  onStatus?: (id: string, status: OrderStatus) => void;
  onView?: (order: AdminOrder) => void;
}) {
  const money = useMoney();
  const business = useBusinessSettings();
  return orders.length ? (
    <div className="table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Date</th>
            <th>Total</th>
            <th>Status</th>
            {onView && <th>Details</th>}
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>
                <b>{order.id}</b>
                <small>
                  {order.items} item{order.items === 1 ? "" : "s"}
                </small>
              </td>
              <td>{order.customer}</td>
              <td>{formatDate(order.date, business.locale, business.timezone)}</td>
              <td>{money(order.total)}</td>
              <td>
                {onStatus ? (
                  <OrderStatusSelect value={order.status} onChange={(value) => onStatus(order.id, value)} />
                ) : (
                  <StatusBadge status={order.status} />
                )}
              </td>
              {onView && (
                <td>
                  <button type="button" className="text-button" onClick={() => onView(order)}>
                    View order
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <EmptyState title="No orders yet" body="New customer orders will appear here." />
  );
}

function OrderDetail({
  order,
  close,
  onStatus,
}: {
  order: AdminOrder;
  close: () => void;
  onStatus: (id: string, status: OrderStatus) => Promise<void>;
}) {
  const money = useMoney();
  const business = useBusinessSettings();
  const notify = useToast();
  const refundable = Math.max(0, (order.payment?.amount ?? 0) - (order.payment?.refundedAmount ?? 0));
  const [note, setNote] = useState(order.internalNote);
  const [refundAmount, setRefundAmount] = useState(refundable ? String(refundable / 100) : "");
  const [refundReason, setRefundReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function saveNote() {
    setBusy(true);
    const response = await mutate({ action: "order-note", orderNumber: order.id, note });
    setBusy(false);
    notify(response.ok ? "Internal note saved." : "The internal note could not be saved.");
  }
  async function retryNotifications() {
    setBusy(true);
    const response = await mutate({ action: "notification-retry", orderNumber: order.id });
    setBusy(false);
    notify(response.ok ? "Pending customer emails were retried." : "Customer emails could not be retried.");
  }
  async function refund() {
    const amount = Math.round(Number(refundAmount) * 100);
    if (!Number.isInteger(amount) || amount < 1 || amount > refundable || refundReason.trim().length < 3) {
      notify("Enter a valid amount and a clear refund reason.");
      return;
    }
    if (!window.confirm(`Refund ${money(amount)} for ${order.id}? Stripe will process this immediately.`)) return;
    setBusy(true);
    const response = await fetch(`/api/admin/orders/${encodeURIComponent(order.id)}/refund`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount, reason: refundReason, idempotencyKey: crypto.randomUUID() }),
    });
    const payload = await response.json().catch(() => null);
    setBusy(false);
    if (response.ok) {
      notify(
        payload?.pending
          ? "Stripe accepted the refund and is still processing it."
          : amount === refundable
            ? "Full refund completed."
            : "Partial refund completed.",
      );
      window.location.reload();
    } else notify(payload?.error ?? "The refund could not be processed.");
  }
  return (
    <>
      <button type="button" className="scrim admin-scrim" onClick={close} aria-label="Close order details" />
      <aside className="admin-drawer order-detail" aria-label={`Order ${order.id}`}>
        <div className="panel-head">
          <div>
            <span className="overline">Order details</span>
            <h2>{order.id}</h2>
          </div>
          <button type="button" className="icon-button" onClick={close} aria-label="Close order details">
            <Icon name="close" />
          </button>
        </div>
        <div className="order-detail-actions no-print">
          <OrderStatusSelect value={order.status} onChange={(value) => onStatus(order.id, value)} />
          <Button variant="secondary" disabled={busy} onClick={retryNotifications}>
            Retry customer emails
          </Button>
          <Button variant="secondary" onClick={() => window.print()}>
            Print summary
          </Button>
        </div>
        <section>
          <h3>Customer and fulfilment</h3>
          <dl className="order-detail-list">
            <div>
              <dt>Customer</dt>
              <dd>{order.customer}</dd>
            </div>
            <div>
              <dt>Contact</dt>
              <dd>
                {order.email}
                <br />
                {order.phone}
              </dd>
            </div>
            <div>
              <dt>Method</dt>
              <dd>{order.fulfilment === "pickup" ? "Bakery pickup" : "Delivery"}</dd>
            </div>
            {order.address && (
              <div>
                <dt>Address</dt>
                <dd>
                  {[
                    order.address.street,
                    order.address.addressLine2,
                    order.address.city,
                    order.address.province,
                    order.address.postalCode,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </dd>
              </div>
            )}
            {order.customerNote && (
              <div>
                <dt>Customer note</dt>
                <dd>{order.customerNote}</dd>
              </div>
            )}
          </dl>
        </section>
        <section>
          <h3>Immutable purchase snapshot</h3>
          <div className="order-lines">
            {order.lines.map((line) => (
              <div key={line.id}>
                <span>
                  <b>{line.productName}</b>
                  <small>
                    {line.variantName} × {line.quantity}
                  </small>
                </span>
                <b>{money(line.finalPrice)}</b>
              </div>
            ))}
          </div>
          <dl className="order-totals">
            <div>
              <dt>Subtotal</dt>
              <dd>{money(order.subtotal)}</dd>
            </div>
            <div>
              <dt>Discount</dt>
              <dd>−{money(order.discountTotal)}</dd>
            </div>
            <div>
              <dt>Delivery</dt>
              <dd>{money(order.deliveryFee)}</dd>
            </div>
            {order.taxTotal > 0 && (
              <div>
                <dt>Tax</dt>
                <dd>{money(order.taxTotal)}</dd>
              </div>
            )}
            <div>
              <dt>Total</dt>
              <dd>{money(order.total)}</dd>
            </div>
          </dl>
        </section>
        <section>
          <h3>Payment</h3>
          {order.payment ? (
            <dl className="order-detail-list">
              <div>
                <dt>Status</dt>
                <dd>{order.payment.status.replaceAll("_", " ")}</dd>
              </div>
              <div>
                <dt>Paid</dt>
                <dd>{money(order.payment.amount)}</dd>
              </div>
              <div>
                <dt>Refunded</dt>
                <dd>{money(order.payment.refundedAmount)}</dd>
              </div>
            </dl>
          ) : (
            <p>No payment attempt has been recorded.</p>
          )}
          {refundable > 0 && !["PENDING_PAYMENT", "FAILED", "CANCELLED"].includes(order.status) && (
            <div className="refund-form no-print">
              <Input
                label={`Refund amount (${order.currency})`}
                type="number"
                min="0.01"
                max={refundable / 100}
                step="0.01"
                value={refundAmount}
                onChange={(event) => setRefundAmount(event.target.value)}
              />
              <Textarea
                label="Reason for refund"
                rows={3}
                value={refundReason}
                onChange={(event) => setRefundReason(event.target.value)}
              />
              <Button disabled={busy} variant="secondary" onClick={refund}>
                {busy ? "Processing…" : "Process Stripe refund"}
              </Button>
            </div>
          )}
        </section>
        <section className="no-print">
          <h3>Internal note</h3>
          <Textarea
            label="Only administrators can see this"
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <Button disabled={busy} variant="secondary" onClick={saveNote}>
            Save internal note
          </Button>
        </section>
        <section>
          <h3>Activity</h3>
          <ol className="order-timeline">
            {order.events.map((event) => (
              <li key={event.id}>
                <b>
                  {event.toStatus
                    ? `${event.fromStatus?.replaceAll("_", " ")} → ${event.toStatus.replaceAll("_", " ")}`
                    : event.eventType.replaceAll("_", " ")}
                </b>
                {event.note && <p>{event.note}</p>}
                <small>{formatDate(event.createdAt, business.locale, business.timezone)}</small>
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </>
  );
}
function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      tone={
        status === "DELIVERED"
          ? "success"
          : status.includes("PENDING") || status.includes("QUOTE")
            ? "warning"
            : "neutral"
      }
    >
      {status.replaceAll("_", " ")}
    </Badge>
  );
}
function OrderStatusSelect({ value, onChange }: { value: OrderStatus; onChange: (value: OrderStatus) => void }) {
  const allowed: Partial<Record<OrderStatus, OrderStatus[]>> = {
    PENDING_PAYMENT: ["CANCELLED"],
    FAILED: ["CANCELLED"],
    PAID: ["CONFIRMED"],
    CONFIRMED: ["PREPARING"],
    PREPARING: ["READY"],
    READY: ["OUT_FOR_DELIVERY", "DELIVERED"],
    OUT_FOR_DELIVERY: ["DELIVERED"],
  };
  const values = allowed[value] ?? [];
  return (
    <select
      className="status-select"
      value={value}
      disabled={!values.length}
      onChange={(e) => onChange(e.target.value as OrderStatus)}
    >
      <option value={value}>{value.replaceAll("_", " ")}</option>
      {values.map((item) => (
        <option key={item} value={item}>
          {item.replaceAll("_", " ")}
        </option>
      ))}
    </select>
  );
}
function AdminFilters({
  query,
  setQuery,
  status,
  setStatus,
  options,
}: {
  query: string;
  setQuery: (value: string) => void;
  status: string;
  setStatus: (value: string) => void;
  options: string[];
}) {
  return (
    <div className="admin-filters">
      <div>
        <Icon name="search" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" />
      </div>
      <select value={status} onChange={(e) => setStatus(e.target.value)}>
        {options.map((item) => (
          <option key={item}>{item.replaceAll("_", " ")}</option>
        ))}
      </select>
    </div>
  );
}

function Products({
  products,
  query,
  status,
  setQuery,
  setStatus,
  onStatus,
  onEdit,
  onDuplicate,
}: {
  products: Product[];
  query: string;
  status: string;
  setQuery: (v: string) => void;
  setStatus: (v: string) => void;
  onStatus: (id: string, status: ProductStatus) => void;
  onEdit: (product: Product) => void;
  onDuplicate: (product: Product) => void;
}) {
  const money = useMoney();
  const visible = products.filter(
    (p) => (status === "ALL" || p.status === status) && p.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <AdminFilters
        query={query}
        setQuery={setQuery}
        status={status}
        setStatus={setStatus}
        options={["ALL", "ACTIVE", "OUT_OF_STOCK", "DRAFT", "ARCHIVED"]}
      />
      <div className="admin-card table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((product) => (
              <tr key={product.id}>
                <td>
                  <div className="product-cell">
                    {product.image ? (
                      <Image src={product.image} alt="" width={48} height={54} />
                    ) : (
                      <span className="admin-image-empty" role="img" aria-label="No product image" />
                    )}
                    <div>
                      <b>{product.name}</b>
                      <small>{product.featured ? `Featured · ${product.slug}` : product.slug}</small>
                    </div>
                  </div>
                </td>
                <td>{product.category.replaceAll("_", " ")}</td>
                <td>{money(product.price)}</td>
                <td>
                  <b className={product.stockQuantity <= product.lowStockThreshold ? "danger-text" : ""}>
                    {product.stockQuantity}
                  </b>
                </td>
                <td>
                  <select
                    className="status-select"
                    value={product.status}
                    onChange={(e) => onStatus(product.id, e.target.value as ProductStatus)}
                  >
                    {["ACTIVE", "OUT_OF_STOCK", "DRAFT", "ARCHIVED"].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <div className="table-actions">
                    <button type="button" className="text-button" onClick={() => onEdit(product)}>
                      Edit
                    </button>
                    <button type="button" className="text-button" onClick={() => onDuplicate(product)}>
                      Duplicate
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
function Inventory({ products, onChange }: { products: Product[]; onChange: (id: string, quantity: number) => void }) {
  return (
    <div className="admin-card">
      <div className="inventory-list">
        {products.map((product) => (
          <article key={product.id}>
            {product.image ? (
              <Image src={product.image} alt="" width={56} height={64} />
            ) : (
              <span className="admin-image-empty" role="img" aria-label="No product image" />
            )}
            <div>
              <b>{product.name}</b>
              <small>Alert at {product.lowStockThreshold} units</small>
            </div>
            <div className="stock-control">
              <button type="button" onClick={() => onChange(product.id, Math.max(0, product.stockQuantity - 1))}>
                −
              </button>
              <b className={product.stockQuantity <= product.lowStockThreshold ? "danger-text" : ""}>
                {product.stockQuantity}
              </b>
              <button type="button" onClick={() => onChange(product.id, product.stockQuantity + 1)}>
                +
              </button>
            </div>
            <StatusBadge
              status={
                product.stockQuantity === 0
                  ? "OUT_OF_STOCK"
                  : product.stockQuantity <= product.lowStockThreshold
                    ? "LOW_STOCK"
                    : "HEALTHY"
              }
            />
          </article>
        ))}
      </div>
    </div>
  );
}
function Customers({ orders }: { orders: AdminOrder[] }) {
  const money = useMoney();
  const business = useBusinessSettings();
  const customers = useMemo(
    () =>
      Object.values(
        orders.reduce<Record<string, { name: string; email: string; orders: number; spent: number; last: string }>>(
          (all, order) => {
            const key = order.email.toLowerCase();
            const current = all[key] ?? {
              name: order.customer,
              email: order.email,
              orders: 0,
              spent: 0,
              last: order.date,
            };
            current.orders += 1;
            current.spent += order.total;
            if (order.date > current.last) current.last = order.date;
            all[key] = current;
            return all;
          },
          {},
        ),
      ),
    [orders],
  );
  return (
    <div className="admin-card table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Contact</th>
            <th>Orders</th>
            <th>Total spent</th>
            <th>Last order</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => (
            <tr key={customer.email}>
              <td>
                <b>{customer.name}</b>
              </td>
              <td>{customer.email}</td>
              <td>{customer.orders}</td>
              <td>{money(customer.spent)}</td>
              <td>{formatDate(customer.last, business.locale, business.timezone)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeliveryZones({
  zones,
  setZones,
}: {
  zones: DeliveryZone[];
  setZones: React.Dispatch<React.SetStateAction<DeliveryZone[]>>;
}) {
  const { currency } = useBusinessSettings();
  return (
    <div className="admin-card zone-list">
      {!zones.length && <p className="admin-empty-copy">No delivery zones yet. Add one to offer delivery.</p>}
      {zones.map((zone, index) => (
        <article key={zone.id}>
          <span className="zone-order-actions">
            <button
              type="button"
              disabled={index === 0}
              onClick={() =>
                setZones((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index - 1 ? zone : itemIndex === index ? current[index - 1] : item,
                  ),
                )
              }
              aria-label={`Move ${zone.name || "new zone"} up`}
            >
              ↑
            </button>
            <button
              type="button"
              disabled={index === zones.length - 1}
              onClick={() =>
                setZones((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index + 1 ? zone : itemIndex === index ? current[index + 1] : item,
                  ),
                )
              }
              aria-label={`Move ${zone.name || "new zone"} down`}
            >
              ↓
            </button>
          </span>
          <Input
            label="Zone"
            value={zone.name}
            onChange={(e) => setZones((v) => v.map((x) => (x.id === zone.id ? { ...x, name: e.target.value } : x)))}
          />
          <Input
            label="Estimate"
            value={zone.estimate}
            onChange={(e) => setZones((v) => v.map((x) => (x.id === zone.id ? { ...x, estimate: e.target.value } : x)))}
          />
          <label>
            <span>Fee ({currency})</span>
            <input
              type="number"
              min="0"
              value={zone.fee / 100}
              onChange={(e) =>
                setZones((v) =>
                  v.map((x) => (x.id === zone.id ? { ...x, fee: Math.round(Number(e.target.value) * 100) } : x)),
                )
              }
            />
          </label>
          <label>
            <span>Minimum order ({currency})</span>
            <input
              type="number"
              min="0"
              value={zone.minimumOrder / 100}
              onChange={(e) =>
                setZones((v) =>
                  v.map((x) =>
                    x.id === zone.id ? { ...x, minimumOrder: Math.round(Number(e.target.value) * 100) } : x,
                  ),
                )
              }
            />
          </label>
          <label className="switch">
            <input
              type="checkbox"
              checked={zone.active}
              onChange={(e) =>
                setZones((v) => v.map((x) => (x.id === zone.id ? { ...x, active: e.target.checked } : x)))
              }
            />
            <span />
          </label>
          {zone.id.startsWith("new-") && (
            <button
              type="button"
              className="icon-button"
              onClick={() => setZones((v) => v.filter((x) => x.id !== zone.id))}
              aria-label="Discard new delivery zone"
            >
              <Icon name="close" />
            </button>
          )}
        </article>
      ))}
    </div>
  );
}

function BusinessSettings({
  initial,
  appearance,
  theme,
  changeTheme,
}: {
  initial: BusinessSettingsData;
  appearance: StoreAppearance;
  theme: StoreTheme;
  changeTheme: (value: StoreTheme) => void;
}) {
  const notify = useToast();
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    const value = {
      ...initial,
      ...fields,
      cakeLeadHours: Number(fields.cakeLeadHours),
      orderMinimum: Math.round(Number(fields.orderMinimum) * 100),
      taxRateBps: Math.round(Number(fields.taxRate) * 100),
      deliveryEnabled: fields.deliveryEnabled === "on",
      pickupEnabled: fields.pickupEnabled === "on",
      taxEnabled: fields.taxEnabled === "on",
      taxDelivery: fields.taxDelivery === "on",
    };
    const response = await mutate({ action: "settings", key: "business", value });
    notify(response.ok ? "Business settings saved." : "Settings could not be saved.");
  }
  async function saveAppearance(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    const value: StoreAppearance = {
      useCustomColors: fields.useCustomColors === "on",
      colors: {
        background: String(fields.background),
        surface: String(fields.surface),
        text: String(fields.text),
        mutedText: String(fields.mutedText),
        primary: String(fields.primary),
        primaryDark: String(fields.primaryDark),
        accent: String(fields.accent),
      },
      contentWidth: fields.contentWidth as StoreAppearance["contentWidth"],
      sectionSpacing: fields.sectionSpacing as StoreAppearance["sectionSpacing"],
      cornerStyle: fields.cornerStyle as StoreAppearance["cornerStyle"],
      productColumns: Number(fields.productColumns),
    };
    const response = await mutate({ action: "settings", key: "appearance", value });
    if (response.ok) {
      notify("Store appearance is now live.");
      window.location.reload();
    } else notify("Store appearance could not be saved.");
  }
  return (
    <div className="settings-grid">
      <div className="admin-card theme-settings">
        <div className="theme-settings-copy">
          <span className="overline">Brand appearance</span>
          <h2>Storefront theme</h2>
          <p>Choose the colour story used across the live shop.</p>
        </div>
        <fieldset className="theme-options" aria-label="Storefront theme">
          {themes.map((option) => (
            <button
              type="button"
              aria-pressed={theme === option.id}
              className={theme === option.id ? "selected" : ""}
              key={option.id}
              onClick={() => changeTheme(option.id)}
            >
              <span className="theme-swatches">
                {option.colors.map((color) => (
                  <i style={{ backgroundColor: color }} key={color} />
                ))}
              </span>
              <b>{option.name}</b>
              <small>{option.description}</small>
              <span className="theme-selected">{theme === option.id ? "Selected ✓" : "Use theme"}</span>
            </button>
          ))}
        </fieldset>
      </div>
      <form className="admin-card form-stack" onSubmit={saveAppearance}>
        <h2>Store colours and layout</h2>
        <p>
          These safe controls update the customer storefront immediately. Mobile layouts remain optimized automatically.
        </p>
        <label className="check-row">
          <input name="useCustomColors" type="checkbox" defaultChecked={appearance.useCustomColors} />
          <span>Use the custom colours below instead of the selected preset</span>
        </label>
        <div className="field-row">
          <Input name="background" label="Page background" type="color" defaultValue={appearance.colors.background} />
          <Input name="surface" label="Cards and panels" type="color" defaultValue={appearance.colors.surface} />
        </div>
        <div className="field-row">
          <Input name="text" label="Main text" type="color" defaultValue={appearance.colors.text} />
          <Input name="mutedText" label="Supporting text" type="color" defaultValue={appearance.colors.mutedText} />
        </div>
        <div className="field-row">
          <Input name="primary" label="Primary brand colour" type="color" defaultValue={appearance.colors.primary} />
          <Input
            name="primaryDark"
            label="Dark brand colour"
            type="color"
            defaultValue={appearance.colors.primaryDark}
          />
          <Input name="accent" label="Accent colour" type="color" defaultValue={appearance.colors.accent} />
        </div>
        <label className="field">
          <span>Content width</span>
          <select name="contentWidth" defaultValue={appearance.contentWidth}>
            <option value="compact">Compact</option>
            <option value="standard">Standard</option>
            <option value="wide">Wide</option>
          </select>
        </label>
        <label className="field">
          <span>Space between sections</span>
          <select name="sectionSpacing" defaultValue={appearance.sectionSpacing}>
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
            <option value="airy">Airy</option>
          </select>
        </label>
        <label className="field">
          <span>Corner style</span>
          <select name="cornerStyle" defaultValue={appearance.cornerStyle}>
            <option value="subtle">Subtle</option>
            <option value="soft">Soft</option>
            <option value="rounded">Rounded</option>
          </select>
        </label>
        <label className="field">
          <span>Products per row on large screens</span>
          <select name="productColumns" defaultValue={appearance.productColumns}>
            <option value="2">2 products</option>
            <option value="3">3 products</option>
            <option value="4">4 products</option>
          </select>
        </label>
        <Button type="submit">Save store appearance</Button>
      </form>
      <form className="admin-card form-stack" onSubmit={save}>
        <h2>Business details</h2>
        <Input name="businessName" label="Business name" defaultValue={initial.businessName} />
        <Input name="contactEmail" label="Contact email" type="email" defaultValue={initial.contactEmail} />
        <Input name="phone" label="Phone" defaultValue={initial.phone} />
        <Input name="whatsapp" label="WhatsApp" defaultValue={initial.whatsapp} />
        <Input name="address" label="Address" defaultValue={initial.address} />
        <Input name="province" label="Province or territory code" maxLength={2} defaultValue={initial.province} />
        <Input name="postalCode" label="Business postal code" maxLength={7} defaultValue={initial.postalCode} />
        <input name="country" type="hidden" value="CA" />
        <Textarea name="openingHours" label="Opening hours" defaultValue={initial.openingHours} rows={3} />
        <Input name="instagramUrl" label="Instagram URL" type="url" defaultValue={initial.instagramUrl} />
        <Input name="currency" label="Currency" maxLength={3} defaultValue={initial.currency} />
        <Input name="locale" label="Locale" defaultValue={initial.locale} />
        <Input name="timezone" label="Timezone" defaultValue={initial.timezone} />
        <Input
          name="orderMinimum"
          label={`Store-wide minimum order (${initial.currency})`}
          type="number"
          min="0"
          defaultValue={initial.orderMinimum / 100}
        />
        <h3>Tax</h3>
        <label className="check-row">
          <input name="taxEnabled" type="checkbox" defaultChecked={initial.taxEnabled} />
          <span>Calculate tax at checkout</span>
        </label>
        <Input name="taxLabel" label="Tax label" defaultValue={initial.taxLabel} />
        <Input
          name="taxRate"
          label="Combined tax rate (%)"
          type="number"
          min="0"
          max="100"
          step="0.01"
          defaultValue={initial.taxRateBps / 100}
        />
        <label className="check-row">
          <input name="taxDelivery" type="checkbox" defaultChecked={initial.taxDelivery} />
          <span>Apply configured tax to delivery fees</span>
        </label>
        <label className="check-row">
          <input name="deliveryEnabled" type="checkbox" defaultChecked={initial.deliveryEnabled} />
          <span>Offer delivery at checkout</span>
        </label>
        <label className="check-row">
          <input name="pickupEnabled" type="checkbox" defaultChecked={initial.pickupEnabled} />
          <span>Offer bakery pickup at checkout</span>
        </label>
        <Input
          name="cakeLeadHours"
          label="Custom cake lead time (hours)"
          type="number"
          min="1"
          defaultValue={initial.cakeLeadHours}
        />
        <Button type="submit">Save settings</Button>
      </form>
    </div>
  );
}

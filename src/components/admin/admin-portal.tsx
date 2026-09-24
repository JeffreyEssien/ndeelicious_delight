"use client";
import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import type { AdminCakeRequest, AdminCategory, AdminCoupon, AdminReview } from "@/lib/data/admin";
import type { DeliveryZone, Order, OrderStatus, Product, ProductStatus } from "@/types";
import { formatDate, formatMoney } from "@/lib/format";
import { Badge, Button, EmptyState, Input, Textarea } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icons";
import { CakeRequests, Coupons, Reviews } from "@/components/admin/live-sections";
import { CakeConfigurationEditor } from "@/components/admin/live-sections";
import { ProductEditor } from "@/components/admin/product-editor";
import { useStoreTheme, useToast, type StoreTheme } from "@/components/providers";
import type {
  BusinessSettings as BusinessSettingsData,
  CakeConfigurationData,
  StorefrontContent,
} from "@/types/content";

type Props = {
  section?: string;
  initialProducts: Product[];
  initialOrders: Order[];
  initialZones: DeliveryZone[];
  initialCakes: AdminCakeRequest[];
  initialCoupons: AdminCoupon[];
  initialCategories: AdminCategory[];
  initialReviews: AdminReview[];
  initialContent: StorefrontContent;
  initialBusiness: BusinessSettingsData;
  initialCakeConfiguration: CakeConfigurationData;
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
}: Props) {
  const [products, setProducts] = useState(initialProducts);
  const [orders, setOrders] = useState(initialOrders);
  const [zones, setZones] = useState(initialZones);
  const [editor, setEditor] = useState<Product | null>();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [zoneBusy, setZoneBusy] = useState(false);
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
    const response = await mutate({ action: "theme", theme: value });
    notify(response.ok ? "Storefront theme is now live." : "Theme changed locally but could not be saved.");
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
      {section === "settings" && <BusinessSettings initial={initialBusiness} theme={theme} changeTheme={changeTheme} />}
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
    </div>
  );
}

function Dashboard({ products, orders, cakes }: { products: Product[]; orders: Order[]; cakes: AdminCakeRequest[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.filter((o) => o.date.slice(0, 10) === today);
  const low = products.filter((p) => p.stockQuantity <= p.lowStockThreshold);
  return (
    <>
      <div className="metric-grid">
        <Metric
          label="Today’s revenue"
          value={formatMoney(
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
            <span className="attention-icon warning">₦</span>
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
function OrderTable({ orders, onStatus }: { orders: Order[]; onStatus?: (id: string, status: OrderStatus) => void }) {
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
              <td>{formatDate(order.date)}</td>
              <td>{formatMoney(order.total)}</td>
              <td>
                {onStatus ? (
                  <OrderStatusSelect value={order.status} onChange={(value) => onStatus(order.id, value)} />
                ) : (
                  <StatusBadge status={order.status} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <EmptyState title="No orders yet" body="New customer orders will appear here." />
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
  const values = [
    "PAID",
    "CONFIRMED",
    "PREPARING",
    "READY",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "CANCELLED",
    "REFUNDED",
  ] as OrderStatus[];
  return (
    <select className="status-select" value={value} onChange={(e) => onChange(e.target.value as OrderStatus)}>
      {!values.includes(value) && <option value={value}>{value.replaceAll("_", " ")}</option>}
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
                <td>{formatMoney(product.price)}</td>
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
function Customers({ orders }: { orders: Order[] }) {
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
              <td>{formatMoney(customer.spent)}</td>
              <td>{formatDate(customer.last)}</td>
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
            <span>Fee (₦)</span>
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
            <span>Minimum order (₦)</span>
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

function ContentSettings({ initial }: { initial: StorefrontContent }) {
  const notify = useToast();
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    const value = {
      ...initial,
      home: {
        ...initial.home,
        hero: {
          ...initial.home.hero,
          eyebrow: String(fields.eyebrow),
          headline: String(fields.headline),
          supportingText: String(fields.supportingText),
          primaryLabel: String(fields.buttonLabel),
        },
      },
    };
    const response = await mutate({ action: "settings", key: "content", value });
    notify(response.ok ? "Storefront content saved." : "Content could not be saved.");
  }
  return (
    <form className="settings-grid" onSubmit={save}>
      <div className="admin-card form-stack">
        <h2>Homepage hero</h2>
        <Input name="eyebrow" label="Eyebrow" defaultValue={initial.home.hero.eyebrow} />
        <Input name="headline" label="Headline" defaultValue={initial.home.hero.headline} />
        <Textarea
          name="supportingText"
          label="Supporting text"
          defaultValue={initial.home.hero.supportingText}
          rows={4}
        />
        <Input name="buttonLabel" label="Primary button label" defaultValue={initial.home.hero.primaryLabel} />
      </div>
      <div className="admin-card form-stack">
        <h2>Publishing</h2>
        <p>Homepage copy above is loaded from and saved directly to the storefront content record.</p>
        <Button type="submit">Save content</Button>
      </div>
    </form>
  );
}
function BusinessSettings({
  initial,
  theme,
  changeTheme,
}: {
  initial: BusinessSettingsData;
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
      deliveryEnabled: fields.deliveryEnabled === "on",
      pickupEnabled: fields.pickupEnabled === "on",
    };
    const response = await mutate({ action: "settings", key: "business", value });
    notify(response.ok ? "Business settings saved." : "Settings could not be saved.");
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
      <form className="admin-card form-stack" onSubmit={save}>
        <h2>Business details</h2>
        <Input name="businessName" label="Business name" defaultValue={initial.businessName} />
        <Input name="contactEmail" label="Contact email" type="email" defaultValue={initial.contactEmail} />
        <Input name="phone" label="Phone" defaultValue={initial.phone} />
        <Input name="whatsapp" label="WhatsApp" defaultValue={initial.whatsapp} />
        <Input name="address" label="Address" defaultValue={initial.address} />
        <Textarea name="openingHours" label="Opening hours" defaultValue={initial.openingHours} rows={3} />
        <Input name="instagramUrl" label="Instagram URL" type="url" defaultValue={initial.instagramUrl} />
        <Input name="currency" label="Currency" defaultValue={initial.currency} />
        <Input
          name="orderMinimum"
          label="Store-wide minimum order (₦)"
          type="number"
          min="0"
          defaultValue={initial.orderMinimum / 100}
        />
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

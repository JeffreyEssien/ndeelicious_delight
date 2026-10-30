"use client";
import { CustomerWorkspace } from "./customer-workspace";
import { InventoryWorkspace } from "./inventory-workspace";
import { HistoryWorkspace } from "./history-workspace";
import { DeliveryWorkspace } from "./delivery-workspace";
import { OrderDetail, OrderStatusSelect } from "./order-panel";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type CSSProperties, type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type {
  AdminAuditLog,
  AdminCakeRequest,
  AdminCategory,
  AdminCoupon,
  AdminOrder,
  AdminReview,
} from "@/lib/data/admin";
import type { DeliveryZone, OrderStatus, Product, ProductStatus } from "@/types";
import { formatDate } from "@/lib/format";
import { categoryLabel, productPriceRange } from "@/features/catalog/pricing";
import { Badge, Button, EmptyState, Input, Textarea } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icons";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import { CakeCatalogue, CakeWorkspace, Coupons, Reviews } from "@/components/admin/live-sections";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { CategoriesManager } from "@/components/admin/categories-manager";
import { ProductEditor } from "@/components/admin/product-editor";
import { ContentSettings } from "@/components/admin/content-settings";
import { MediaLibrary } from "@/components/admin/media-library";
import { CarouselEditor } from "@/components/admin/carousel-editor";
import { HeroEditor } from "@/components/admin/hero-editor";
import { SocialPostGenerator } from "@/components/admin/social-post-generator";
import { useBusinessSettings, useMoney, useStoreTheme, useToast, type StoreTheme } from "@/components/providers";
import type {
  BusinessSettings as BusinessSettingsData,
  CakeConfigurationData,
  StoreAppearance,
  StoreCarousel,
  StoreHero,
  StorefrontContent,
  MarketingExport,
} from "@/types/content";
import { resolveThemeTokens, themeTokenCss } from "@/lib/theme/tokens";
import type { DashboardSummary } from "@/lib/data/admin-dashboard";
import type { AnalyticsSnapshot } from "@/features/analytics/analytics";
import { AnalyticsWorkspace } from "@/components/admin/analytics-workspace";

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
  initialCarousel: StoreCarousel;
  initialHero: StoreHero;
  initialMarketing: MarketingExport;
  initialAuditLogs: AdminAuditLog[];
  initialAnalytics: AnalyticsSnapshot | null;
  initialDashboard?: DashboardSummary | null;
  siteUrl: string;
};
const titles: Record<string, string> = {
  dashboard: "Today",
  orders: "Orders",
  "custom-cakes": "Cake requests",
  cakes: "Cakes",
  categories: "Categories",
  products: "Products",
  inventory: "Stock",
  customers: "Customers",
  coupons: "Coupons & offers",
  reviews: "Reviews",
  content: "Website content",
  carousel: "Homepage",
  media: "Image library",
  marketing: "Marketing posts",
  delivery: "Delivery & pricing",
  settings: "Business details",
  audit: "Activity log",
  analytics: "Reports",
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
  initialZones,
  initialCakes,
  initialCoupons,
  initialCategories,
  initialReviews,
  initialContent,
  initialBusiness,
  initialCakeConfiguration,
  initialAppearance,
  initialCarousel,
  initialHero,
  initialMarketing,
  initialAuditLogs,
  initialAnalytics,
  initialDashboard,
  siteUrl,
}: Props) {
  const [products, setProducts] = useState(initialProducts);
  const [editor, setEditor] = useState<Product | null>();
  // A stray click outside the product drawer or an Escape press should not throw away work. Unsaved
  // changes are also backed up on this device and offered back when the product is opened again.
  const editorDirty = useRef(false);
  const trackEditorDirty = useCallback((dirty: boolean) => {
    editorDirty.current = dirty;
  }, []);
  const closeEditor = () => {
    if (
      editorDirty.current &&
      !window.confirm(
        "Close without saving? Your changes are kept on this device. Open the product again to restore them. (Photos not yet uploaded will need adding again.)",
      )
    )
      return;
    editorDirty.current = false;
    setEditor(undefined);
  };
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const notify = useToast();
  const router = useRouter();
  const { theme, setTheme } = useStoreTheme();
  useEffect(() => setProducts(initialProducts), [initialProducts]);
  // Seed the product search from a global-search deep link (?q=…).
  useEffect(() => {
    if (section !== "products") return;
    const seeded = new URLSearchParams(window.location.search).get("q");
    if (seeded) setQuery(seeded);
  }, [section]);
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
  async function deleteProduct(product: Product) {
    const response = await fetch(`/api/admin/products/${product.id}`, { method: "DELETE" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      notify(payload.error ?? "Product could not be deleted.");
      return false;
    }
    setProducts((current) => current.filter((item) => item.id !== product.id));
    notify(`${product.name} deleted.`);
    router.refresh();
    return true;
  }
  async function duplicateProduct(product: Product) {
    const response = await fetch(`/api/admin/products/${product.id}`, { method: "POST" });
    const payload = await response.json();
    if (response.ok) {
      notify(`${product.name} duplicated as a draft.`);
      router.refresh();
    } else notify(payload.error ?? "Product could not be duplicated.");
  }
  async function changeTheme(value: StoreTheme) {
    setTheme(value);
    const [themeResponse, appearanceResponse] = await Promise.all([
      mutate({ action: "theme", theme: value }),
      mutate({ action: "settings", key: "appearance", value: { ...initialAppearance, useCustomColors: false } }),
    ]);
    if (themeResponse.ok && appearanceResponse.ok) {
      notify("Storefront theme is now live.");
      router.refresh();
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
        </div>
      </div>
      {section === "dashboard" && initialDashboard && <Dashboard summary={initialDashboard} />}
      {section === "analytics" && initialAnalytics && <AnalyticsWorkspace snapshot={initialAnalytics} />}
      {section === "orders" && (
        <HistoryWorkspace<AdminOrder>
          kind="orders"
          renderDetail={(order, close, refresh) => (
            <OrderDetail
              order={order}
              close={close}
              onRefresh={refresh}
              onStatus={async (id, status) => {
                const response = await mutate({ action: "order-status", orderNumber: id, status });
                const payload = await response.json().catch(() => null);
                notify(response.ok ? "Order updated." : (payload?.error ?? "Order could not be updated."));
                if (response.ok) await refresh();
              }}
            />
          )}
        />
      )}
      {section === "custom-cakes" && <CakeWorkspace requests={initialCakes} configuration={initialCakeConfiguration} />}
      {section === "cakes" && <CakeCatalogue configuration={initialCakeConfiguration} />}
      {section === "categories" && <CategoriesManager />}
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
          onDelete={deleteProduct}
        />
      )}
      {section === "inventory" && <InventoryWorkspace onEdit={setEditor} />}
      {section === "customers" && <CustomerWorkspace />}
      {section === "coupons" && <Coupons initial={initialCoupons} products={products} categories={initialCategories} />}
      {section === "reviews" && <Reviews initial={initialReviews} />}
      {section === "content" && <ContentSettings initial={initialContent} />}
      {section === "carousel" && (
        <>
          <HeroEditor products={products} initial={initialHero} />
          <CarouselEditor products={products} initial={initialCarousel} />
        </>
      )}
      {section === "media" && <MediaLibrary />}
      {section === "marketing" && (
        <SocialPostGenerator products={products} initial={initialMarketing} siteUrl={siteUrl} />
      )}
      {section === "delivery" && <DeliveryWorkspace initialZones={initialZones} />}
      {section === "audit" && <AuditLog entries={initialAuditLogs} />}
      {section === "settings" && (
        <BusinessSettings
          initial={initialBusiness}
          appearance={initialAppearance}
          theme={theme}
          changeTheme={changeTheme}
        />
      )}
      {editor !== undefined && (
        <ModalOverlay
          open
          onClose={closeEditor}
          className="admin-drawer product-editor"
          scrimClassName="admin-scrim"
          ariaLabel={editor ? `Edit ${editor.name}` : "Add product"}
        >
          <ProductEditor
            product={editor}
            flavourLibrary={initialCakeConfiguration.options
              .filter((option) => option.type === "flavour" && option.active)
              .map((option) => option.name)}
            fillingLibrary={initialCakeConfiguration.options
              .filter((option) => option.type === "filling" && option.active)
              .map((option) => option.name)}
            sizeLibrary={initialCakeConfiguration.options
              .filter((option) => option.type === "size" && option.active)
              .map((option) => ({ name: option.name, price: option.priceAdjustment }))}
            close={closeEditor}
            onDirtyChange={trackEditorDirty}
            onSaved={(updated) => {
              setProducts((current) =>
                current.map((product) => (product.id === editor?.id ? { ...product, ...updated } : product)),
              );
              editorDirty.current = false;
              setEditor(undefined);
              notify("Product saved. Storefront visibility is up to date.");
              router.refresh();
            }}
          />
        </ModalOverlay>
      )}
    </div>
  );
}

function auditLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const auditMessages: Record<string, string> = {
  PRODUCT_CREATED: "created a product",
  PRODUCT_UPDATED: "updated a product",
  PRODUCT_DUPLICATED: "duplicated a product",
  PRODUCT_DELETED: "deleted a product",
  PRODUCT_IMAGE_ADDED: "added a product photo",
  PRODUCT_STATUS_CHANGED: "changed a product’s visibility",
  STOCK_CHANGED: "adjusted inventory",
  ORDER_STATUS_CHANGED: "moved an order to its next stage",
  ORDER_NOTE_CHANGED: "updated an internal order note",
  ORDER_NOTIFICATION_RETRY_REQUESTED: "retried an order email",
  REFUND_INITIATED: "started a refund",
  CAKE_QUOTE_SENT: "sent a custom cake quote",
  QUOTE_ISSUED: "created and queued a custom cake quote",
  CAKE_QUOTE_DELIVERY_RETRY_REQUESTED: "retried a custom cake quote email",
  CAKE_REQUEST_STATUS_CHANGED: "updated a cake request",
  CAKE_OPTIONS_CHANGED: "updated cake builder choices",
  REVIEW_STATUS_CHANGED: "moderated a customer review",
  COUPONS_CHANGED: "updated promotions",
  DELIVERY_ZONES_CHANGED: "updated delivery areas",
  SITE_SETTING_CHANGED: "updated store settings",
  THEME_CHANGED: "changed the storefront theme",
};

function auditEntity(entry: AdminAuditLog) {
  const friendlyType: Record<string, string> = {
    product: "Product",
    order: "Order",
    order_refund: "Refund",
    custom_cake_order: "Cake request",
    custom_cake_options: "Cake builder",
    review: "Review",
    coupons: "Promotions",
    delivery_zones: "Delivery",
    site_setting: "Settings",
  };
  return `${friendlyType[entry.entityType] ?? auditLabel(entry.entityType)}${entry.entityId && entry.entityId !== "all" ? ` · ${entry.entityId}` : ""}`;
}

function changedFields(entry: AdminAuditLog) {
  if (!entry.previousValue) return "A new record was added.";
  if (!entry.newValue) {
    const name = (entry.previousValue as { name?: unknown }).name;
    return typeof name === "string" ? `“${name}” was deleted.` : "The record was deleted.";
  }
  const before = entry.previousValue;
  const after = entry.newValue;
  if (
    typeof before !== "object" ||
    before === null ||
    Array.isArray(before) ||
    typeof after !== "object" ||
    after === null ||
    Array.isArray(after)
  )
    return "The saved information changed.";
  const changed = Object.keys({ ...before, ...after }).filter(
    (key) => JSON.stringify(before[key as keyof typeof before]) !== JSON.stringify(after[key as keyof typeof after]),
  );
  if (!changed.length) return "The action was recorded successfully.";
  return `Changed ${changed.slice(0, 3).map(auditLabel).join(", ")}${changed.length > 3 ? ` and ${changed.length - 3} more` : ""}.`;
}

function AuditLog({ entries }: { entries: AdminAuditLog[] }) {
  const business = useBusinessSettings();
  if (!entries.length) {
    return <EmptyState title="No audited changes yet" body="Sensitive admin changes will appear here." />;
  }
  return (
    <div className="audit-workspace">
      <div className="audit-intro">
        <div>
          <span className="overline">Store history</span>
          <h2>What changed in your store</h2>
          <p>A simple record of important changes, who made them, and when.</p>
        </div>
        <span className="audit-count">Latest {entries.length} changes</span>
      </div>
      <ol className="audit-feed">
        {entries.map((entry) => (
          <li className="admin-card" key={entry.id}>
            <span className="audit-avatar">{entry.actorName.slice(0, 1).toUpperCase()}</span>
            <div className="audit-copy">
              <p>
                <b>{entry.actorName}</b> {auditMessages[entry.action] ?? auditLabel(entry.action).toLowerCase()}.
              </p>
              <span>{changedFields(entry)}</span>
              <small>
                {auditEntity(entry)} · {formatDate(entry.createdAt, business.locale, business.timezone)}
              </small>
            </div>
            <details className="audit-details">
              <summary>See details</summary>
              <div>
                <p>Use this detail only when you need to check exactly what changed.</p>
                <b>Before</b>
                <pre>{JSON.stringify(entry.previousValue, null, 2) ?? "None"}</pre>
                <b>After</b>
                <pre>{JSON.stringify(entry.newValue, null, 2) ?? "None"}</pre>
              </div>
            </details>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Dashboard({ summary }: { summary: DashboardSummary }) {
  const money = useMoney();
  return (
    <>
      <div className="metric-grid">
        <Metric
          label="30-day net revenue"
          value={money(summary.netRevenue)}
          delta={
            summary.revenueChange === null
              ? "First comparison period"
              : `${summary.revenueChange >= 0 ? "+" : ""}${summary.revenueChange.toFixed(1)}% vs prior 30 days`
          }
        />
        <Metric
          label="Paid orders"
          value={String(summary.paidOrders)}
          delta={`${money(summary.averageOrderValue)} average order`}
        />
        <Metric
          label="Returning customers"
          value={`${summary.repeatCustomerRate.toFixed(1)}%`}
          delta={`${summary.returningCustomers} returned in 30 days`}
        />
        <Metric label="Low stock" value={String(summary.lowStockProducts)} delta="Review inventory" />
      </div>
      <div className="dashboard-analytics-link">
        <div>
          <span className="overline">Business pulse</span>
          <b>Your analytics are ready</b>
          <p>See performance across sales, customers and operations.</p>
        </div>
        <Link className="button button-secondary" href="/admin/analytics">
          Open analytics <Icon name="arrow" />
        </Link>
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
          <OrderTable orders={summary.recentOrders} />
        </div>
        <div className="admin-card attention-list">
          <div className="card-head">
            <div>
              <h2>Needs your attention</h2>
              <p>Tap to jump straight to it</p>
            </div>
          </div>
          {summary.waitingQuotes === 0 && summary.lowStockProducts === 0 ? (
            <article>
              <span className="attention-icon success">✓</span>
              <div>
                <b>You’re all caught up</b>
                <small>No waiting quotes or low stock right now.</small>
              </div>
            </article>
          ) : (
            <>
              {summary.waitingQuotes > 0 && (
                <Link className="attention-row" href="/admin/custom-cakes">
                  <span className="attention-icon warning">$</span>
                  <div>
                    <b>
                      {summary.waitingQuotes} cake {summary.waitingQuotes === 1 ? "quote" : "quotes"} waiting for a
                      price
                    </b>
                    <small>Send a quote so the customer can pay</small>
                  </div>
                  <Icon name="arrow" />
                </Link>
              )}
              {summary.lowStockProducts > 0 && (
                <Link className="attention-row" href="/admin/inventory">
                  <span className="attention-icon danger">!</span>
                  <div>
                    <b>
                      {summary.lowStockProducts} {summary.lowStockProducts === 1 ? "product is" : "products are"}{" "}
                      running low
                    </b>
                    <small>Top up today’s quantities</small>
                  </div>
                  <Icon name="arrow" />
                </Link>
              )}
            </>
          )}
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
  orders: DashboardSummary["recentOrders"];
  onStatus?: (id: string, status: OrderStatus) => void;
  onView?: (order: DashboardSummary["recentOrders"][number]) => void;
}) {
  const money = useMoney();
  const business = useBusinessSettings();
  return orders.length ? (
    <div className="table-scroll mobile-card-table orders-table">
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
        <input
          aria-label="Search records"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
        />
      </div>
      <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
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
  onDelete,
}: {
  products: Product[];
  query: string;
  status: string;
  setQuery: (v: string) => void;
  setStatus: (v: string) => void;
  onStatus: (id: string, status: ProductStatus) => void;
  onEdit: (product: Product) => void;
  onDuplicate: (product: Product) => void;
  onDelete: (product: Product) => Promise<boolean>;
}) {
  const money = useMoney();
  const priceRange = (product: Product) => {
    const { min, max } = productPriceRange(product);
    return min === max ? money(min) : `${money(min)} – ${money(max)}`;
  };
  const [removeTarget, setRemoveTarget] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const visible = products.filter(
    (p) =>
      (status === "ALL" || p.status === status) &&
      `${p.name} ${p.category} ${p.slug} ${p.variants.map((variant) => variant.sku).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const lowStock = products.filter(
    (product) => product.trackInventory !== false && product.stockQuantity <= product.lowStockThreshold,
  ).length;
  return (
    <>
      <div className="admin-summary-strip">
        <span>
          <b>{products.length}</b> products
        </span>
        <span>
          <b>{products.filter((product) => product.status === "ACTIVE").length}</b> live in the shop
        </span>
        <span className={lowStock ? "needs-attention" : ""}>
          <b>{lowStock}</b> need stock attention
        </span>
      </div>
      <AdminFilters
        query={query}
        setQuery={setQuery}
        status={status}
        setStatus={setStatus}
        options={["ALL", "ACTIVE", "OUT_OF_STOCK", "DRAFT", "ARCHIVED"]}
      />
      {visible.length === 0 ? (
        <EmptyState
          title={query || status !== "ALL" ? "No products match" : "No products yet"}
          body={
            query || status !== "ALL"
              ? "Try a different search or status filter."
              : "Add your first product to start selling."
          }
        />
      ) : (
        <div className="admin-card table-scroll mobile-card-table products-table">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Options</th>
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
                        <Image src={product.image} alt="" width={48} height={54} unoptimized />
                      ) : (
                        <span className="admin-image-empty" role="img" aria-label="No product image" />
                      )}
                      <div>
                        <b>{product.name}</b>
                        <small>
                          {product.featured
                            ? "Featured product"
                            : product.shoppingMode?.replaceAll("_", " ").toLowerCase()}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>{categoryLabel(product.category)}</td>
                  <td>{priceRange(product)}</td>
                  <td>
                    <b className={product.stockQuantity <= product.lowStockThreshold ? "danger-text" : ""}>
                      {product.stockQuantity}
                    </b>
                    <small>Alert at {product.lowStockThreshold}</small>
                  </td>
                  <td>
                    <b>{product.variants.length}</b>
                    <small>{product.variants[0]?.sku ?? "No SKU"}</small>
                  </td>
                  <td>
                    <select
                      className="status-select"
                      aria-label={`Change status for ${product.name}`}
                      value={product.status}
                      onChange={(e) => onStatus(product.id, e.target.value as ProductStatus)}
                    >
                      {["ACTIVE", "OUT_OF_STOCK", "DRAFT", "ARCHIVED"].map((item) => (
                        <option key={item} value={item}>
                          {item.replaceAll("_", " ")}
                        </option>
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
                      {product.status === "ARCHIVED" ? (
                        <button type="button" className="text-button" onClick={() => onStatus(product.id, "DRAFT")}>
                          Restore
                        </button>
                      ) : (
                        <button type="button" className="text-button" onClick={() => setRemoveTarget(product)}>
                          Archive
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-button danger-text"
                        onClick={() => setDeleteTarget(product)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={removeTarget !== null}
        tone="danger"
        title="Archive this product?"
        body={
          removeTarget
            ? `“${removeTarget.name}” will be hidden from customers. You can restore it anytime from the Archived filter.`
            : ""
        }
        confirmLabel="Archive"
        onConfirm={() => {
          if (removeTarget) onStatus(removeTarget.id, "ARCHIVED");
          setRemoveTarget(null);
        }}
        onCancel={() => setRemoveTarget(null)}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        tone="danger"
        busy={deleting}
        title="Delete this product for good?"
        body={
          deleteTarget
            ? `“${deleteTarget.name}” will be removed from the shop and from admin, with its photos, options and reviews. This can’t be undone. Past orders and receipts keep its name and price.`
            : ""
        }
        confirmLabel="Delete permanently"
        onConfirm={async () => {
          if (!deleteTarget) return;
          setDeleting(true);
          const deleted = await onDelete(deleteTarget);
          setDeleting(false);
          if (deleted) setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
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
  const router = useRouter();
  const notify = useToast();
  const [previewTheme, setPreviewTheme] = useState(theme);
  const [appearanceState, setAppearanceState] = useState<"saved" | "unsaved" | "saving" | "failed">("saved");
  const [businessState, setBusinessState] = useState<"saved" | "unsaved" | "saving" | "failed">("saved");
  const previewTokens = resolveThemeTokens(previewTheme, { ...appearance, useCustomColors: false });
  const previewStyle = themeTokenCss(previewTokens) as CSSProperties;
  // Show the saved Instagram URL back as a friendly @handle when it points at instagram.com.
  const instagramDisplay = initial.instagramUrl
    ? initial.instagramUrl.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "@").replace(/\/+$/, "")
    : "";
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusinessState("saving");
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    const value = {
      ...initial,
      ...fields,
      orderMinimum: Math.round(Number(fields.orderMinimum) * 100),
      taxRateBps: Math.round(Number(fields.taxRate) * 100),
      deliveryEnabled: fields.deliveryEnabled === "on",
      pickupEnabled: fields.pickupEnabled === "on",
      taxEnabled: fields.taxEnabled === "on",
      taxDelivery: fields.taxDelivery === "on",
    };
    const response = await mutate({ action: "settings", key: "business", value });
    setBusinessState(response.ok ? "saved" : "failed");
    notify(response.ok ? "Business settings saved." : "Settings could not be saved.");
  }
  async function saveAppearance(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAppearanceState("saving");
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
      setAppearanceState("saved");
      notify("Store appearance is now live.");
      router.refresh();
    } else {
      setAppearanceState("failed");
      notify("Store appearance could not be saved.");
    }
  }
  return (
    <div className="settings-grid">
      <div className="settings-start admin-card">
        <div>
          <span className="overline">Store controls</span>
          <h2>Choose what you want to manage</h2>
          <p>Business details, ordering rules, and your storefront look are grouped below.</p>
        </div>
        <nav aria-label="Settings sections">
          <a href="#business-settings">Business & ordering</a>
          <a href="#brand-settings">Brand theme</a>
          <a href="#layout-settings">Colours & layout</a>
          <Link href="/admin/content">Website text & pages</Link>
          <Link href="/admin/delivery">Delivery areas</Link>
          <Link href="/admin/cakes">Cakes & options</Link>
        </nav>
      </div>
      <div className="admin-card theme-settings" id="brand-settings">
        <div className="theme-settings-copy">
          <span className="overline">Brand appearance</span>
          <h2>Storefront theme</h2>
          <p>Choose the colour story used across the live shop.</p>
        </div>
        <fieldset className="theme-options" aria-label="Storefront theme">
          {themes.map((option) => (
            <button
              type="button"
              aria-pressed={previewTheme === option.id}
              className={previewTheme === option.id ? "selected" : ""}
              key={option.id}
              onClick={() => setPreviewTheme(option.id)}
            >
              <span className="theme-swatches">
                {option.colors.map((color) => (
                  <i style={{ backgroundColor: color }} key={color} />
                ))}
              </span>
              <b>{option.name}</b>
              <small>{option.description}</small>
              <span className="theme-selected">{previewTheme === option.id ? "Previewing ✓" : "Preview theme"}</span>
            </button>
          ))}
        </fieldset>
        <div className="store-theme-preview" style={previewStyle} data-theme-preview={previewTheme}>
          <div className="store-theme-preview-head">
            <span className="overline">Live storefront preview</span>
            <h3>Made for your sweetest moments</h3>
            <p>See headings, supporting text, actions, fields, cards, and feature areas together.</p>
          </div>
          <div className="store-theme-preview-actions">
            <button type="button" className="button button-primary">
              Order a treat
            </button>
            <button type="button" className="button button-secondary">
              View details
            </button>
          </div>
          <label className="field">
            <span>Delivery area</span>
            <input readOnly value={initial.city || "Delivery area"} />
          </label>
          <article className="store-theme-preview-product">
            <span className="badge badge-berry">Bestseller</span>
            <b>Celebration cake</b>
            <small>From CAD $65.00</small>
          </article>
          <aside>
            <b>Freshly baked for you</b>
            <span>Feature sections remain readable in every theme.</span>
          </aside>
        </div>
        <div className="theme-publish-row">
          <span>
            {previewTheme === theme ? "This is the live theme." : "Preview only — the storefront has not changed yet."}
          </span>
          <Button disabled={previewTheme === theme} onClick={() => changeTheme(previewTheme)}>
            Publish this theme
          </Button>
        </div>
      </div>
      <form
        className="admin-card form-stack"
        id="layout-settings"
        onSubmit={saveAppearance}
        onChange={() => setAppearanceState("unsaved")}
      >
        <h2>Colours &amp; layout</h2>
        <p>
          Most owners just pick a theme above — it sets beautiful colours for you. Everything below is optional and
          already set to sensible defaults. Changes go live right away and stay mobile-friendly.
        </p>
        <details className="settings-advanced">
          <summary>Advanced: exact colours &amp; layout</summary>
          <label className="check-row">
            <input name="useCustomColors" type="checkbox" defaultChecked={appearance.useCustomColors} />
            <span>Use my own custom colours instead of the chosen theme</span>
          </label>
          <fieldset className="colour-group">
            <legend>Your brand colours</legend>
            <small className="field-hint">
              The main colour for buttons and highlights. This is the one customers notice.
            </small>
            <div className="field-row">
              <Input name="primary" label="Brand colour" type="color" defaultValue={appearance.colors.primary} />
              <Input
                name="primaryDark"
                label="Brand colour (darker)"
                type="color"
                defaultValue={appearance.colors.primaryDark}
              />
              <Input name="accent" label="Accent" type="color" defaultValue={appearance.colors.accent} />
            </div>
          </fieldset>
          <fieldset className="colour-group">
            <legend>Page &amp; text colours</legend>
            <small className="field-hint">Background and text shades. The defaults suit most bakeries.</small>
            <div className="field-row">
              <Input
                name="background"
                label="Page background"
                type="color"
                defaultValue={appearance.colors.background}
              />
              <Input name="surface" label="Cards &amp; panels" type="color" defaultValue={appearance.colors.surface} />
            </div>
            <div className="field-row">
              <Input name="text" label="Main text" type="color" defaultValue={appearance.colors.text} />
              <Input name="mutedText" label="Supporting text" type="color" defaultValue={appearance.colors.mutedText} />
            </div>
          </fieldset>
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
        </details>
        <span className="document-save-state" role="status">
          {appearanceState === "saved"
            ? "Appearance saved"
            : appearanceState === "saving"
              ? "Saving appearance…"
              : appearanceState === "failed"
                ? "Save failed — retry"
                : "Unsaved appearance changes"}
        </span>
        <Button type="submit" disabled={appearanceState === "saving"}>
          Save store appearance
        </Button>
      </form>
      <form
        className="admin-card form-stack business-settings-form"
        id="business-settings"
        onSubmit={save}
        onChange={() => setBusinessState("unsaved")}
      >
        <h2>Business details</h2>
        <Input name="businessName" label="Business name" defaultValue={initial.businessName} />
        <Input name="contactEmail" label="Contact email" type="email" defaultValue={initial.contactEmail} />
        <Input name="phone" label="Phone" defaultValue={initial.phone} />
        <div className="field-with-hint">
          <Input
            name="whatsapp"
            label="WhatsApp number"
            placeholder="+1 902 555 1234"
            defaultValue={initial.whatsapp}
          />
          <small className="field-hint">
            Your WhatsApp number with country code. You can also paste a wa.me link if you prefer.
          </small>
        </div>
        <div className="field-with-hint">
          <Input name="instagramUrl" label="Instagram" placeholder="@yourbakery" defaultValue={instagramDisplay} />
          <small className="field-hint">Just your @handle — or paste your full profile link.</small>
        </div>
        <Input name="address" label="Address" defaultValue={initial.address} />
        <Input name="city" label="City" defaultValue={initial.city ?? ""} />
        <input name="country" type="hidden" value="CA" />
        <Textarea name="openingHours" label="Opening hours" defaultValue={initial.openingHours} rows={3} />
        <h3>Ordering</h3>
        <label className="check-row">
          <input name="deliveryEnabled" type="checkbox" defaultChecked={initial.deliveryEnabled} />
          <span>Offer delivery at checkout</span>
        </label>
        <label className="check-row">
          <input name="pickupEnabled" type="checkbox" defaultChecked={initial.pickupEnabled} />
          <span>Offer bakery pickup at checkout</span>
        </label>
        <Input
          name="orderMinimum"
          label={`Smallest order you’ll accept (${initial.currency})`}
          type="number"
          min="0"
          defaultValue={initial.orderMinimum / 100}
        />
        <details className="settings-advanced">
          <summary>Advanced: region &amp; currency</summary>
          <p className="field-hint">
            These already match a Halifax, Nova Scotia bakery. Only change them if your business is set up differently.
          </p>
          <Input name="province" label="Province or territory code" maxLength={2} defaultValue={initial.province} />
          <Input name="postalCode" label="Business postal code" maxLength={7} defaultValue={initial.postalCode} />
          <Input name="currency" label="Currency" maxLength={3} defaultValue={initial.currency} />
          <Input name="locale" label="Locale" defaultValue={initial.locale} />
          <Input name="timezone" label="Timezone" defaultValue={initial.timezone} />
        </details>
        <details className="settings-advanced">
          <summary>Tax settings</summary>
          <label className="check-row">
            <input name="taxEnabled" type="checkbox" defaultChecked={initial.taxEnabled} />
            <span>Calculate tax at checkout</span>
          </label>
          <Input name="taxLabel" label="Tax label" defaultValue={initial.taxLabel} />
          <Input
            name="taxRegistrationNumber"
            label="GST/HST registration number"
            defaultValue={initial.taxRegistrationNumber}
          />
          <input name="taxRate" type="hidden" value="14" />
          <p className="field-hint">
            Nova Scotia HST is 14% on eligible taxable lines. Product classification and pack quantity determine each
            line’s treatment. Delivery fees are never taxed.
          </p>
        </details>
        <span className="document-save-state" role="status">
          {businessState === "saved"
            ? "Business settings saved"
            : businessState === "saving"
              ? "Saving settings…"
              : businessState === "failed"
                ? "Save failed — retry"
                : "Unsaved business changes"}
        </span>
        <Button type="submit" disabled={businessState === "saving"}>
          Save settings
        </Button>
      </form>
    </div>
  );
}

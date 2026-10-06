"use client";

import { useState } from "react";
import { useBusinessSettings, useMoney } from "@/components/providers";
import type { AnalyticsPeriod, AnalyticsRange, AnalyticsSnapshot } from "@/features/analytics/analytics";
import { formatDate } from "@/lib/format";

const ranges: Array<{ value: AnalyticsRange; label: string }> = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "All time" },
];
const views = ["Overview", "Sales", "Customers", "Products", "Operations"] as const;
type AnalyticsView = (typeof views)[number];

const percent = (value: number) => `${value.toFixed(1)}%`;
const count = (value: number) => new Intl.NumberFormat("en-CA", { maximumFractionDigits: 1 }).format(value);
function hours(value: number | null) {
  if (value === null) return "Not enough data";
  return value < 24 ? `${value.toFixed(1)} hours` : `${(value / 24).toFixed(1)} days`;
}
function changeLabel(value: number | null) {
  if (value === null) return "First comparison period";
  if (value === 0) return "No change from last period";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}% from last period`;
}

export function AnalyticsWorkspace({ snapshot }: { snapshot: AnalyticsSnapshot }) {
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const [view, setView] = useState<AnalyticsView>("Overview");
  const period = snapshot.periods[range];
  const money = useMoney();
  const business = useBusinessSettings();

  return (
    <div className="analytics-workspace">
      <header className="analytics-toolbar">
        <div>
          <span className="overline">Business performance</span>
          <h2>{period.label}</h2>
          <p>Updated {formatDate(snapshot.generatedAt, business.locale, business.timezone)}</p>
        </div>
        <fieldset className="analytics-range" aria-label="Choose reporting period">
          {ranges.map((item) => (
            <button
              type="button"
              className={range === item.value ? "active" : ""}
              aria-pressed={range === item.value}
              onClick={() => setRange(item.value)}
              key={item.value}
            >
              {item.label}
            </button>
          ))}
        </fieldset>
      </header>

      <nav className="analytics-tabs" aria-label="Analytics sections">
        {views.map((item) => (
          <button
            type="button"
            className={view === item ? "active" : ""}
            aria-current={view === item ? "page" : undefined}
            onClick={() => setView(item)}
            key={item}
          >
            {item}
          </button>
        ))}
      </nav>

      {snapshot.capped && (
        <p className="analytics-notice" role="status">
          This report reached its 5,000-row limit, so older activity may be excluded.
        </p>
      )}
      {!snapshot.eventTrackingAvailable && view === "Customers" && (
        <p className="analytics-notice" role="status">
          Storefront journey data will appear after analytics migration 0028 is applied.
        </p>
      )}

      {view === "Overview" && <Overview period={period} money={money} />}
      {view === "Sales" && <Sales period={period} money={money} />}
      {view === "Customers" && <Customers period={period} snapshot={snapshot} money={money} />}
      {view === "Products" && <Products period={period} snapshot={snapshot} money={money} />}
      {view === "Operations" && <Operations period={period} snapshot={snapshot} money={money} />}

      <details className="analytics-method-note">
        <summary>How these numbers are calculated</summary>
        <p>
          Revenue is successful payments minus recorded refunds. Customers are grouped by normalized email and shown
          only as totals. Stock value uses selling price, so it is not profit or accounting cost.
        </p>
      </details>
    </div>
  );
}

function Overview({ period, money }: { period: AnalyticsPeriod; money: (value: number) => string }) {
  const maxTrend = Math.max(1, ...period.revenueTrend.map((item) => item.revenue));
  return (
    <div className="analytics-view analytics-overview">
      <section className="analytics-hero" aria-labelledby="analytics-revenue-title">
        <div className="analytics-hero-total">
          <span id="analytics-revenue-title">Net revenue</span>
          <b>{money(period.netRevenue)}</b>
          <small>{changeLabel(period.revenueChange)}</small>
        </div>
        <div className="analytics-hero-metrics">
          <SimpleMetric label="Paid orders" value={count(period.paidOrders)} note={changeLabel(period.orderChange)} />
          <SimpleMetric label="Average order" value={money(period.averageOrderValue)} />
          <SimpleMetric label="Returning customers" value={percent(period.repeatCustomerRate)} />
        </div>
      </section>

      <section className="admin-card analytics-chart-card" aria-labelledby="revenue-trend-title">
        <CardHead title="Revenue trend" subtitle="Net revenue over time" id="revenue-trend-title" />
        <div className="analytics-chart" aria-hidden="true">
          {period.revenueTrend.map((item) => (
            <div className="analytics-bar-column" key={item.label} title={`${item.label}: ${money(item.revenue)}`}>
              <div className="analytics-bar-track">
                <i style={{ height: `${Math.max(item.revenue ? 4 : 0, (item.revenue / maxTrend) * 100)}%` }} />
              </div>
              <small>{item.label}</small>
            </div>
          ))}
        </div>
        <p className="sr-only">
          {period.revenueTrend.map((item) => `${item.label}: ${money(item.revenue)}`).join("; ")}
        </p>
      </section>

      <section className="admin-card analytics-insights" aria-labelledby="insights-title">
        <CardHead title="Focus next" subtitle="The strongest signals in your data" id="insights-title" />
        <div>
          {period.insights.slice(0, 3).map((insight, index) => (
            <article className={`analytics-insight ${insight.tone}`} key={insight.title}>
              <span>{index + 1}</span>
              <div>
                <h3>{insight.title}</h3>
                <p>{insight.meaning}</p>
                <strong>{insight.action}</strong>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Sales({ period, money }: { period: AnalyticsPeriod; money: (value: number) => string }) {
  return (
    <div className="analytics-view">
      <Section title="Sales health" subtitle="What came in and what reduced it">
        <div className="analytics-detail-grid">
          <DetailMetric
            label="Gross payments"
            value={money(period.grossRevenue)}
            meaning="Successful payments before refunds."
            action="Compare with net revenue to see refund drag."
          />
          <DetailMetric
            label="Refunded"
            value={money(period.refunds)}
            note={percent(period.refundRate)}
            meaning="Money returned through recorded refunds."
            action="Review affected orders when this starts rising."
          />
          <DetailMetric
            label="Discounts"
            value={money(period.discounts)}
            note={percent(period.discountRate)}
            meaning="Discounts as a share of merchandise value."
            action="Check that offers create sales instead of giving away demand."
          />
          <DetailMetric
            label="Pending payments"
            value={count(period.pendingPayments)}
            meaning="Orders created but not successfully paid."
            action="Check payment links and follow up quickly."
          />
          <DetailMetric
            label="Cancelled or failed"
            value={percent(period.cancellationRate)}
            note={`${period.cancelledOrders} orders`}
            meaning="Created orders that ended cancelled or failed."
            action="Separate payment failures from customer cancellations."
          />
          <DetailMetric
            label="Items per order"
            value={count(period.averageItemsPerOrder)}
            meaning="Average product units in each paid order."
            action="Use relevant bundles to increase basket depth."
          />
        </div>
      </Section>
      <Section title="Revenue details" subtitle="Amounts collected alongside sales">
        <div className="analytics-detail-grid analytics-detail-grid-small">
          <DetailMetric
            label="Tax collected"
            value={money(period.taxCollected)}
            meaning="Tax included in paid orders."
            action="Use accounting records for formal filings."
          />
          <DetailMetric
            label="Delivery fees"
            value={money(period.deliveryFees)}
            meaning="Delivery charges collected."
            action="Compare with courier cost to protect margin."
          />
          <DetailMetric
            label="Coupon revenue"
            value={money(period.couponRevenue)}
            note={`${period.couponOrders} orders`}
            meaning="Net revenue from coupon-backed orders."
            action="Compare revenue gained with discount cost."
          />
          <DetailMetric
            label="Coupon discounts"
            value={money(period.couponDiscounts)}
            meaning="Discount value given on coupon orders."
            action="Treat this as direct promotional cost."
          />
        </div>
        <PerformanceTable
          empty="No coupon sales in this period."
          headers={["Coupon", "Orders", "Revenue", "Discount"]}
          rows={period.coupons
            .slice(0, 8)
            .map((coupon) => [coupon.code, count(coupon.orders), money(coupon.revenue), money(coupon.discounts)])}
        />
      </Section>
    </div>
  );
}

function Customers({
  period,
  snapshot,
  money,
}: {
  period: AnalyticsPeriod;
  snapshot: AnalyticsSnapshot;
  money: (value: number) => string;
}) {
  const awaiting = snapshot.eventTrackingAvailable ? null : "Awaiting migration";
  return (
    <div className="analytics-view">
      <Section title="Customers" subtitle="Audience growth and loyalty">
        <div className="analytics-detail-grid">
          <DetailMetric
            label="Unique buyers"
            value={count(period.uniqueCustomers)}
            meaning="Distinct customers with paid orders."
            action="Separate audience growth from repeat purchasing."
          />
          <DetailMetric
            label="New buyers"
            value={count(period.newCustomers)}
            meaning="Buyers without an earlier paid order."
            action="Shows whether promotion is reaching new customers."
          />
          <DetailMetric
            label="Returning buyers"
            value={count(period.returningCustomers)}
            note={percent(period.repeatCustomerRate)}
            meaning="Buyers who had purchased before or ordered repeatedly."
            action="Strengthen this with timely post-purchase follow-up."
          />
          <DetailMetric
            label="Revenue per buyer"
            value={money(period.revenuePerCustomer)}
            meaning="Net revenue divided by unique buyers."
            action="Helps set sensible acquisition and retention budgets."
          />
          <DetailMetric
            label="Subscribers"
            value={count(snapshot.activeSubscribers)}
            meaning="People currently opted into your newsletter."
            action="Use this owned audience for launches and reminders."
          />
          <DetailMetric
            label="Average rating"
            value={period.reviewCount ? `${period.averageRating.toFixed(1)} / 5` : "No reviews"}
            note={`${period.reviewCount} reviews`}
            meaning="Average rating submitted in this period."
            action="Act on repeated feedback themes."
          />
        </div>
      </Section>
      <Section title="Storefront journey" subtitle="Where visitors continue or drop off">
        <div className="analytics-funnel">
          <SimpleMetric label="Product viewers" value={awaiting ?? count(period.productViewers)} />
          <SimpleMetric
            label="Added to cart"
            value={awaiting ?? count(period.cartVisitors)}
            note={awaiting ? undefined : `${percent(period.productToCartRate)} of viewers`}
          />
          <SimpleMetric
            label="Started checkout"
            value={awaiting ?? count(period.checkoutVisitors)}
            note={awaiting ? undefined : `${percent(period.cartToCheckoutRate)} of carts`}
          />
        </div>
        <div className="analytics-detail-grid analytics-detail-grid-small">
          <DetailMetric
            label="Search users"
            value={awaiting ?? count(period.searches)}
            meaning="Visitors who searched; query text is not stored."
            action="Frequent use may signal navigation gaps."
          />
          <DetailMetric
            label="Cake-builder starts"
            value={awaiting ?? count(period.cakeBuilderStarts)}
            meaning="Visitors who began building a custom cake."
            action="Compare starts with completions to find friction."
          />
          <DetailMetric
            label="Cake-builder completion"
            value={awaiting ?? percent(period.cakeBuilderCompletionRate)}
            meaning="Builder completions divided by starts."
            action="A low rate can indicate too many steps or unclear choices."
          />
        </div>
      </Section>
    </div>
  );
}

function Products({
  period,
  snapshot,
  money,
}: {
  period: AnalyticsPeriod;
  snapshot: AnalyticsSnapshot;
  money: (value: number) => string;
}) {
  return (
    <div className="analytics-view">
      <Section title="Best sellers" subtitle="Products ranked by paid revenue">
        <PerformanceTable
          empty="No paid product sales in this period."
          headers={["Product", "Units", "Revenue", "Share"]}
          rows={period.products
            .slice(0, 12)
            .map((product) => [product.name, count(product.units), money(product.revenue), percent(product.share)])}
        />
      </Section>
      <Section title="Inventory" subtitle="What is available to sell now">
        <div className="analytics-detail-grid analytics-detail-grid-small">
          <DetailMetric
            label="Active products"
            value={count(snapshot.inventory.activeProducts)}
            meaning="Products currently available for sale."
            action="Keep the range focused and current."
          />
          <DetailMetric
            label="Low stock"
            value={count(snapshot.inventory.lowStockProducts)}
            meaning="Products at or below their stock threshold."
            action="Restock strong sellers first."
          />
          <DetailMetric
            label="Out of stock"
            value={count(snapshot.inventory.outOfStockProducts)}
            meaning="Products unavailable or at zero stock."
            action="Replenish proven products and archive intentional gaps."
          />
          <DetailMetric
            label="Retail stock value"
            value={money(snapshot.inventory.retailStockValue)}
            meaning="Units multiplied by selling price, not cost or profit."
            action="Use this to understand sales exposure only."
          />
        </div>
      </Section>
    </div>
  );
}

function Operations({
  period,
  snapshot,
  money,
}: {
  period: AnalyticsPeriod;
  snapshot: AnalyticsSnapshot;
  money: (value: number) => string;
}) {
  return (
    <div className="analytics-view">
      <Section title="Custom cakes" subtitle="Enquiries moving toward confirmed orders">
        <div className="analytics-detail-grid analytics-detail-grid-small">
          <DetailMetric
            label="Requests"
            value={count(period.cakeRequests)}
            meaning="New custom-cake enquiries."
            action="Compare demand with available capacity."
          />
          <DetailMetric
            label="Quotes prepared"
            value={count(period.cakeQuotes)}
            meaning="Requests progressed beyond quote required."
            action="A large gap may signal response-time pressure."
          />
          <DetailMetric
            label="Converted orders"
            value={count(period.cakeConversions)}
            note={percent(period.cakeConversionRate)}
            meaning="Cake requests linked to an order."
            action="Use this as the strongest conversion measure."
          />
          <DetailMetric
            label="Open quote value"
            value={money(period.cakePipelineValue)}
            meaning="Quoted value not yet linked to orders."
            action="Follow up on recent high-value quotes first."
          />
        </div>
      </Section>
      <Section title="Fulfilment" subtitle="How reliably orders move">
        <div className="analytics-detail-grid analytics-detail-grid-small">
          <DetailMetric
            label="Delivery orders"
            value={count(period.deliveryOrders)}
            meaning="Paid orders assigned to delivery."
            action="Use this to plan courier capacity."
          />
          <DetailMetric
            label="Pickup orders"
            value={count(period.pickupOrders)}
            meaning="Paid orders collected by customers."
            action="Promote pickup where delivery limits growth."
          />
          <DetailMetric
            label="Time to payment"
            value={hours(period.averageHoursToPaid)}
            meaning="Average time from order creation to payment."
            action="Long delays may indicate payment friction."
          />
          <DetailMetric
            label="Time to delivery"
            value={hours(period.averageHoursToDelivered)}
            meaning="Average time from creation to delivery."
            action="Compare this with the promise made to customers."
          />
          <DetailMetric
            label="Email success"
            value={percent(period.notificationSuccessRate)}
            meaning="Transactional messages marked sent, not failed."
            action="Investigate SMTP problems if this falls below 98%."
          />
          <DetailMetric
            label="Open enquiries"
            value={count(snapshot.unresolvedContacts)}
            meaning="Contact messages without a resolution time."
            action="Keep the queue small so opportunities are not lost."
          />
        </div>
        <StatusBreakdown period={period} />
      </Section>
      <Section title="Delivery areas" subtitle="Paid delivery demand by zone">
        <PerformanceTable
          empty="No paid deliveries in this period."
          headers={["Zone", "Orders", "Revenue"]}
          rows={period.deliveryZones.map((zone) => [zone.name, count(zone.orders), money(zone.revenue)])}
        />
      </Section>
    </div>
  );
}

function CardHead({ title, subtitle, id }: { title: string; subtitle: string; id?: string }) {
  return (
    <div className="analytics-card-head">
      <div>
        <h2 id={id}>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}
function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="analytics-section admin-card">
      <CardHead title={title} subtitle={subtitle} />
      <div className="analytics-section-content">{children}</div>
    </section>
  );
}
function SimpleMetric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="analytics-simple-metric">
      <span>{label}</span>
      <b>{value}</b>
      {note && <small>{note}</small>}
    </div>
  );
}
function DetailMetric({
  label,
  value,
  note,
  meaning,
  action,
}: {
  label: string;
  value: string;
  note?: string;
  meaning: string;
  action: string;
}) {
  return (
    <article className="analytics-metric">
      <span>{label}</span>
      <b>{value}</b>
      {note && <small>{note}</small>}
      <details>
        <summary>Why it matters</summary>
        <p>{meaning}</p>
        <strong>{action}</strong>
      </details>
    </article>
  );
}
function PerformanceTable({ empty, headers, rows }: { empty: string; headers: string[]; rows: string[][] }) {
  if (!rows.length) return <p className="analytics-empty">{empty}</p>;
  return (
    <div className="analytics-table">
      <table className="admin-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join("-")}>
              {row.map((value, index) => (
                <td data-label={headers[index]} key={`${headers[index]}-${value}`}>
                  {index === 0 ? <b>{value}</b> : value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function StatusBreakdown({ period }: { period: AnalyticsPeriod }) {
  const total = Math.max(
    1,
    period.statusBreakdown.reduce((sum, item) => sum + item.value, 0),
  );
  if (!period.statusBreakdown.length) return <p className="analytics-empty">No orders were created in this period.</p>;
  return (
    <section className="analytics-status-list" aria-label="Order status breakdown">
      {period.statusBreakdown.map((item) => (
        <div key={item.label}>
          <span>{item.label.replaceAll("_", " ").toLowerCase()}</span>
          <i>
            <b style={{ width: `${(item.value / total) * 100}%` }} />
          </i>
          <strong>{item.value}</strong>
        </div>
      ))}
    </section>
  );
}

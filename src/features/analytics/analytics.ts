import type { DeliveryZone, Product } from "@/types";

export type AnalyticsRange = "7d" | "30d" | "90d" | "all";

export type AnalyticsOrderRow = {
  id: string;
  email: string;
  status: string;
  createdAt: string;
  fulfilment: "delivery" | "pickup";
  deliveryZoneId: string | null;
  couponId: string | null;
  subtotal: number;
  discountTotal: number;
  deliveryFee: number;
  taxTotal: number;
  grandTotal: number;
  payment: { status: string; amount: number; refundedAmount: number; paidAt: string | null } | null;
  lines: Array<{ productId: string | null; productName: string; quantity: number; finalPrice: number }>;
  events: Array<{ eventType: string; toStatus: string | null; createdAt: string }>;
};

export type AnalyticsCakeRow = {
  status: string;
  createdAt: string;
  quotedTotal: number | null;
  orderId: string | null;
};

export type AnalyticsCouponRow = { id: string; code: string };
export type AnalyticsReviewRow = { rating: number; status: string; createdAt: string };
export type AnalyticsNotificationRow = { status: string; createdAt: string; sentAt: string | null };
export type AnalyticsEventRow = { eventName: string; anonymousId: string; productId: string | null; createdAt: string };

export type AnalyticsSource = {
  orders: AnalyticsOrderRow[];
  cakes: AnalyticsCakeRow[];
  coupons: AnalyticsCouponRow[];
  reviews: AnalyticsReviewRow[];
  notifications: AnalyticsNotificationRow[];
  events: AnalyticsEventRow[];
  products: Product[];
  zones: DeliveryZone[];
  activeSubscribers: number;
  unresolvedContacts: number;
  capped: boolean;
  eventTrackingAvailable: boolean;
};

export type AnalyticsInsight = {
  tone: "positive" | "attention" | "neutral";
  title: string;
  meaning: string;
  action: string;
};

export type AnalyticsPeriod = {
  label: string;
  start: string | null;
  end: string;
  grossRevenue: number;
  refunds: number;
  netRevenue: number;
  revenueChange: number | null;
  ordersCreated: number;
  paidOrders: number;
  orderChange: number | null;
  averageOrderValue: number;
  averageItemsPerOrder: number;
  uniqueCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  repeatCustomerRate: number;
  revenuePerCustomer: number;
  discounts: number;
  discountRate: number;
  taxCollected: number;
  deliveryFees: number;
  deliveryOrders: number;
  pickupOrders: number;
  cancelledOrders: number;
  cancellationRate: number;
  refundedOrders: number;
  refundRate: number;
  pendingPayments: number;
  cakeRequests: number;
  cakeQuotes: number;
  cakeConversions: number;
  cakeConversionRate: number;
  cakePipelineValue: number;
  couponOrders: number;
  couponRevenue: number;
  couponDiscounts: number;
  averageRating: number;
  reviewCount: number;
  averageHoursToPaid: number | null;
  averageHoursToDelivered: number | null;
  notificationSuccessRate: number;
  productViewers: number;
  cartVisitors: number;
  checkoutVisitors: number;
  productToCartRate: number;
  cartToCheckoutRate: number;
  searches: number;
  cakeBuilderStarts: number;
  cakeBuilderCompletions: number;
  cakeBuilderCompletionRate: number;
  statusBreakdown: Array<{ label: string; value: number }>;
  revenueTrend: Array<{ label: string; revenue: number; orders: number }>;
  products: Array<{ id: string; name: string; units: number; revenue: number; share: number }>;
  coupons: Array<{ id: string; code: string; orders: number; revenue: number; discounts: number }>;
  deliveryZones: Array<{ id: string; name: string; orders: number; revenue: number }>;
  insights: AnalyticsInsight[];
};

export type AnalyticsSnapshot = {
  generatedAt: string;
  capped: boolean;
  eventTrackingAvailable: boolean;
  periods: Record<AnalyticsRange, AnalyticsPeriod>;
  inventory: {
    activeProducts: number;
    lowStockProducts: number;
    outOfStockProducts: number;
    retailStockValue: number;
  };
  activeSubscribers: number;
  unresolvedContacts: number;
};

const paidStatuses = new Set(["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"]);
const paidOrderStatuses = new Set([
  "PAID",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "REFUNDED",
]);

function percent(part: number, whole: number) {
  return whole > 0 ? (part / whole) * 100 : 0;
}

function change(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

function paymentDate(order: AnalyticsOrderRow) {
  return order.payment?.paidAt ?? order.createdAt;
}

function isPaid(order: AnalyticsOrderRow) {
  return order.payment ? paidStatuses.has(order.payment.status) : paidOrderStatuses.has(order.status);
}

function gross(order: AnalyticsOrderRow) {
  return order.payment && paidStatuses.has(order.payment.status) ? order.payment.amount : order.grandTotal;
}

function refunded(order: AnalyticsOrderRow) {
  return order.payment?.refundedAmount ?? (order.status === "REFUNDED" ? order.grandTotal : 0);
}

function inWindow(value: string, start: Date | null, end: Date) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) && (!start || time >= start.getTime()) && time < end.getTime();
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function hoursBetween(first: string, second: string) {
  return Math.max(0, (new Date(second).getTime() - new Date(first).getTime()) / 3_600_000);
}

function periodStart(end: Date, days: number | null) {
  return days === null ? null : new Date(end.getTime() - days * 86_400_000);
}

function trend(orders: AnalyticsOrderRow[], start: Date | null, end: Date, days: number | null) {
  const bucketDays = days === null || days > 90 ? 30 : days > 30 ? 7 : 1;
  const earliest =
    start ?? new Date(Math.min(...orders.map((order) => new Date(paymentDate(order)).getTime()), end.getTime()));
  const bucketMs = bucketDays * 86_400_000;
  const bucketCount = Math.max(1, Math.ceil((end.getTime() - earliest.getTime()) / bucketMs));
  const buckets = Array.from({ length: Math.min(bucketCount, 18) }, (_, index) => {
    const offset = Math.max(0, bucketCount - 18) + index;
    const from = new Date(earliest.getTime() + offset * bucketMs);
    return { from, to: new Date(Math.min(end.getTime(), from.getTime() + bucketMs)), revenue: 0, orders: 0 };
  });
  for (const order of orders) {
    const bucket = buckets.find((item) => inWindow(paymentDate(order), item.from, item.to));
    if (!bucket) continue;
    bucket.revenue += Math.max(0, gross(order) - refunded(order));
    bucket.orders += 1;
  }
  return buckets.map((bucket) => ({
    label: new Intl.DateTimeFormat("en-CA", { month: "short", day: bucketDays < 30 ? "numeric" : undefined }).format(
      bucket.from,
    ),
    revenue: bucket.revenue,
    orders: bucket.orders,
  }));
}

function calculatePeriod(
  source: AnalyticsSource,
  range: AnalyticsRange,
  now: Date,
  days: number | null,
): AnalyticsPeriod {
  const end = now;
  const start = periodStart(end, days);
  const previousStart = days === null ? null : periodStart(start as Date, days);
  const createdOrders = source.orders.filter((order) => inWindow(order.createdAt, start, end));
  const sales = source.orders.filter((order) => isPaid(order) && inWindow(paymentDate(order), start, end));
  const previousSales =
    days === null
      ? []
      : source.orders.filter((order) => isPaid(order) && inWindow(paymentDate(order), previousStart, start as Date));
  const grossRevenue = sales.reduce((sum, order) => sum + gross(order), 0);
  const refunds = sales.reduce((sum, order) => sum + refunded(order), 0);
  const netRevenue = Math.max(0, grossRevenue - refunds);
  const previousRevenue = previousSales.reduce((sum, order) => sum + Math.max(0, gross(order) - refunded(order)), 0);
  const customerOrders = new Map<string, AnalyticsOrderRow[]>();
  for (const order of source.orders.filter(isPaid)) {
    const key = order.email.trim().toLowerCase();
    customerOrders.set(key, [...(customerOrders.get(key) ?? []), order]);
  }
  const currentCustomerEmails = [...new Set(sales.map((order) => order.email.trim().toLowerCase()))];
  let returningCustomers = 0;
  for (const email of currentCustomerEmails) {
    const orders = (customerOrders.get(email) ?? []).sort((a, b) => paymentDate(a).localeCompare(paymentDate(b)));
    const current = orders.filter((order) => inWindow(paymentDate(order), start, end));
    const hadPriorOrder = orders.some((order) => start && new Date(paymentDate(order)) < start);
    if (hadPriorOrder || current.length > 1) returningCustomers += 1;
  }
  const newCustomers = Math.max(0, currentCustomerEmails.length - returningCustomers);
  const productMap = new Map<string, { id: string; name: string; units: number; revenue: number }>();
  for (const order of sales) {
    for (const line of order.lines) {
      const id = line.productId ?? line.productName;
      const current = productMap.get(id) ?? { id, name: line.productName, units: 0, revenue: 0 };
      current.units += line.quantity;
      current.revenue += line.finalPrice;
      productMap.set(id, current);
    }
  }
  const products = [...productMap.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .map((product) => ({
      ...product,
      share: percent(
        product.revenue,
        sales.reduce((sum, order) => sum + order.subtotal, 0),
      ),
    }));
  const couponMap = new Map<string, { id: string; code: string; orders: number; revenue: number; discounts: number }>();
  for (const order of sales.filter((item) => item.couponId)) {
    const id = order.couponId as string;
    const code = source.coupons.find((coupon) => coupon.id === id)?.code ?? "Archived coupon";
    const current = couponMap.get(id) ?? { id, code, orders: 0, revenue: 0, discounts: 0 };
    current.orders += 1;
    current.revenue += Math.max(0, gross(order) - refunded(order));
    current.discounts += order.discountTotal;
    couponMap.set(id, current);
  }
  const zoneMap = new Map<string, { id: string; name: string; orders: number; revenue: number }>();
  for (const order of sales.filter((item) => item.fulfilment === "delivery")) {
    const id = order.deliveryZoneId ?? "unknown";
    const name = source.zones.find((zone) => zone.id === id)?.name ?? "Unassigned zone";
    const current = zoneMap.get(id) ?? { id, name, orders: 0, revenue: 0 };
    current.orders += 1;
    current.revenue += Math.max(0, gross(order) - refunded(order));
    zoneMap.set(id, current);
  }
  const cakes = source.cakes.filter((cake) => inWindow(cake.createdAt, start, end));
  const cakeQuotes = cakes.filter((cake) => cake.quotedTotal !== null || cake.status !== "QUOTE_REQUIRED");
  const cakeConversions = cakes.filter((cake) => cake.orderId);
  const reviews = source.reviews.filter((review) => inWindow(review.createdAt, start, end));
  const notifications = source.notifications.filter((notification) => inWindow(notification.createdAt, start, end));
  const events = source.events.filter((event) => inWindow(event.createdAt, start, end));
  const eventSessions = (name: string) =>
    new Set(events.filter((event) => event.eventName === name).map((event) => event.anonymousId)).size;
  const productViewers = eventSessions("PRODUCT_VIEWED");
  const cartVisitors = eventSessions("ADD_TO_CART");
  const checkoutVisitors = eventSessions("CHECKOUT_STARTED");
  const cakeBuilderStarts = eventSessions("CAKE_BUILDER_STARTED");
  const cakeBuilderCompletions = eventSessions("CAKE_BUILDER_COMPLETED");
  const completedNotifications = notifications.filter((notification) =>
    ["SENT", "FAILED"].includes(notification.status),
  );
  const paidHours = sales.flatMap((order) =>
    order.payment?.paidAt ? [hoursBetween(order.createdAt, order.payment.paidAt)] : [],
  );
  const deliveredHours = sales.flatMap((order) => {
    const delivered = order.events.find((event) => event.toStatus === "DELIVERED");
    return delivered ? [hoursBetween(order.createdAt, delivered.createdAt)] : [];
  });
  const statusBreakdown = [...new Set(createdOrders.map((order) => order.status))]
    .map((status) => ({ label: status, value: createdOrders.filter((order) => order.status === status).length }))
    .sort((a, b) => b.value - a.value);
  const deliveryOrders = sales.filter((order) => order.fulfilment === "delivery").length;
  const pickupOrders = sales.filter((order) => order.fulfilment === "pickup").length;
  const cancelledOrders = createdOrders.filter((order) => ["CANCELLED", "FAILED"].includes(order.status)).length;
  const refundedOrders = sales.filter((order) => refunded(order) > 0).length;
  const discounts = sales.reduce((sum, order) => sum + order.discountTotal, 0);
  const couponOrders = sales.filter((order) => order.couponId).length;
  const totalItems = sales.reduce(
    (sum, order) => sum + order.lines.reduce((lineSum, line) => lineSum + line.quantity, 0),
    0,
  );
  const result: AnalyticsPeriod = {
    label: range === "all" ? "All time" : `Last ${days} days`,
    start: start?.toISOString() ?? null,
    end: end.toISOString(),
    grossRevenue,
    refunds,
    netRevenue,
    revenueChange: days === null ? null : change(netRevenue, previousRevenue),
    ordersCreated: createdOrders.length,
    paidOrders: sales.length,
    orderChange: days === null ? null : change(sales.length, previousSales.length),
    averageOrderValue: sales.length ? Math.round(netRevenue / sales.length) : 0,
    averageItemsPerOrder: sales.length ? totalItems / sales.length : 0,
    uniqueCustomers: currentCustomerEmails.length,
    newCustomers,
    returningCustomers,
    repeatCustomerRate: percent(returningCustomers, currentCustomerEmails.length),
    revenuePerCustomer: currentCustomerEmails.length ? Math.round(netRevenue / currentCustomerEmails.length) : 0,
    discounts,
    discountRate: percent(
      discounts,
      sales.reduce((sum, order) => sum + order.subtotal + order.discountTotal, 0),
    ),
    taxCollected: sales.reduce((sum, order) => sum + order.taxTotal, 0),
    deliveryFees: sales.reduce((sum, order) => sum + order.deliveryFee, 0),
    deliveryOrders,
    pickupOrders,
    cancelledOrders,
    cancellationRate: percent(cancelledOrders, createdOrders.length),
    refundedOrders,
    refundRate: percent(refundedOrders, sales.length),
    pendingPayments: createdOrders.filter((order) => order.status === "PENDING_PAYMENT").length,
    cakeRequests: cakes.length,
    cakeQuotes: cakeQuotes.length,
    cakeConversions: cakeConversions.length,
    cakeConversionRate: percent(cakeConversions.length, cakes.length),
    cakePipelineValue: cakeQuotes.reduce((sum, cake) => sum + (cake.orderId ? 0 : (cake.quotedTotal ?? 0)), 0),
    couponOrders,
    couponRevenue: sales
      .filter((order) => order.couponId)
      .reduce((sum, order) => sum + gross(order) - refunded(order), 0),
    couponDiscounts: sales.filter((order) => order.couponId).reduce((sum, order) => sum + order.discountTotal, 0),
    averageRating: reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0,
    reviewCount: reviews.length,
    averageHoursToPaid: average(paidHours),
    averageHoursToDelivered: average(deliveredHours),
    notificationSuccessRate: percent(
      completedNotifications.filter((notification) => notification.status === "SENT").length,
      completedNotifications.length,
    ),
    productViewers,
    cartVisitors,
    checkoutVisitors,
    productToCartRate: percent(cartVisitors, productViewers),
    cartToCheckoutRate: percent(checkoutVisitors, cartVisitors),
    searches: eventSessions("SEARCH_PERFORMED"),
    cakeBuilderStarts,
    cakeBuilderCompletions,
    cakeBuilderCompletionRate: percent(cakeBuilderCompletions, cakeBuilderStarts),
    statusBreakdown,
    revenueTrend: trend(sales, start, end, days),
    products,
    coupons: [...couponMap.values()].sort((a, b) => b.revenue - a.revenue),
    deliveryZones: [...zoneMap.values()].sort((a, b) => b.revenue - a.revenue),
    insights: [],
  };
  result.insights = buildInsights(result, source);
  return result;
}

function buildInsights(period: AnalyticsPeriod, source: AnalyticsSource): AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = [];
  if (period.revenueChange !== null && period.revenueChange >= 10)
    insights.push({
      tone: "positive",
      title: "Revenue momentum is improving",
      meaning: `Net revenue is ${period.revenueChange.toFixed(1)}% higher than the previous comparable period.`,
      action:
        "Protect what is working: keep best sellers available and repeat the campaigns that supported this period.",
    });
  if (period.revenueChange !== null && period.revenueChange <= -10)
    insights.push({
      tone: "attention",
      title: "Revenue has slowed",
      meaning: `Net revenue is ${Math.abs(period.revenueChange).toFixed(1)}% below the previous comparable period.`,
      action:
        "Review product availability, recent promotion activity and abandoned pending payments before discounting broadly.",
    });
  if (period.repeatCustomerRate < 20 && period.uniqueCustomers >= 5)
    insights.push({
      tone: "attention",
      title: "Repeat purchasing has room to grow",
      meaning: `Only ${period.repeatCustomerRate.toFixed(1)}% of customers in this period returned for another purchase.`,
      action:
        "Use post-purchase email, review invitations and a targeted returning-customer offer to encourage a second order.",
    });
  if (period.products[0]?.share >= 40)
    insights.push({
      tone: "neutral",
      title: "Sales depend heavily on one product",
      meaning: `${period.products[0].name} contributes ${period.products[0].share.toFixed(1)}% of product revenue.`,
      action: "Keep it in stock, then cross-sell a complementary item to reduce concentration risk.",
    });
  if (period.cakeRequests >= 3 && period.cakeConversionRate < 35)
    insights.push({
      tone: "attention",
      title: "Cake enquiries are not converting consistently",
      meaning: `${period.cakeConversionRate.toFixed(1)}% of cake requests became linked orders.`,
      action:
        "Shorten quote response time and review whether pricing, availability or follow-up copy is creating friction.",
    });
  if (period.pendingPayments > 0)
    insights.push({
      tone: "neutral",
      title: "Revenue is waiting at payment",
      meaning: `${period.pendingPayments} order${period.pendingPayments === 1 ? " is" : "s are"} still pending payment.`,
      action: "Check whether payment links were delivered and follow up while purchase intent is still fresh.",
    });
  const lowStock = source.products.filter(
    (product) => product.status === "ACTIVE" && product.stockQuantity <= product.lowStockThreshold,
  ).length;
  if (lowStock)
    insights.push({
      tone: "attention",
      title: "Best-seller availability needs attention",
      meaning: `${lowStock} active product${lowStock === 1 ? " is" : "s are"} at or below the low-stock threshold.`,
      action: "Restock the highest-revenue items first to avoid losing demand already visible in this report.",
    });
  if (!insights.length)
    insights.push({
      tone: "neutral",
      title: "Build a stronger comparison baseline",
      meaning: "There is not enough activity in this period to identify a reliable trend yet.",
      action:
        "Keep orders, payments and product stock accurate; insights become more useful as clean history accumulates.",
    });
  return insights.slice(0, 5);
}

export function calculateAnalytics(source: AnalyticsSource, now = new Date()): AnalyticsSnapshot {
  const activeProducts = source.products.filter((product) => product.status === "ACTIVE");
  return {
    generatedAt: now.toISOString(),
    capped: source.capped,
    eventTrackingAvailable: source.eventTrackingAvailable,
    periods: {
      "7d": calculatePeriod(source, "7d", now, 7),
      "30d": calculatePeriod(source, "30d", now, 30),
      "90d": calculatePeriod(source, "90d", now, 90),
      all: calculatePeriod(source, "all", now, null),
    },
    inventory: {
      activeProducts: activeProducts.length,
      lowStockProducts: activeProducts.filter((product) => product.stockQuantity <= product.lowStockThreshold).length,
      outOfStockProducts: source.products.filter(
        (product) => product.status === "OUT_OF_STOCK" || (product.status === "ACTIVE" && product.stockQuantity === 0),
      ).length,
      retailStockValue: activeProducts.reduce((sum, product) => sum + product.price * product.stockQuantity, 0),
    },
    activeSubscribers: source.activeSubscribers,
    unresolvedContacts: source.unresolvedContacts,
  };
}

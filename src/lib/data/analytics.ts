import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeliveryZone, Product } from "@/types";
import {
  calculateAnalytics,
  type AnalyticsCakeRow,
  type AnalyticsCouponRow,
  type AnalyticsEventRow,
  type AnalyticsNotificationRow,
  type AnalyticsOrderRow,
  type AnalyticsReviewRow,
} from "@/features/analytics/analytics";

const analyticsRowLimit = 5_000;

export async function getAnalyticsSnapshot(supabase: SupabaseClient, products: Product[], zones: DeliveryZone[]) {
  const [
    orderResult,
    cakeResult,
    couponResult,
    reviewResult,
    notificationResult,
    eventResult,
    subscriberResult,
    contactResult,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id,email,status,created_at,fulfilment,delivery_zone_id,coupon_id,subtotal,discount_total,delivery_fee,tax_total,grand_total,order_items(product_id,product_name,quantity,final_price),payments(status,amount,refunded_amount,paid_at,created_at),order_events(event_type,to_status,created_at)",
      )
      .order("created_at", { ascending: false })
      .limit(analyticsRowLimit),
    supabase
      .from("custom_cake_orders")
      .select("status,created_at,quoted_total,order_id")
      .order("created_at", { ascending: false })
      .limit(analyticsRowLimit),
    supabase.from("coupons").select("id,code").limit(analyticsRowLimit),
    supabase
      .from("reviews")
      .select("rating,status,created_at")
      .order("created_at", { ascending: false })
      .limit(analyticsRowLimit),
    supabase
      .from("order_notifications")
      .select("status,created_at,sent_at")
      .order("created_at", { ascending: false })
      .limit(analyticsRowLimit),
    supabase
      .from("analytics_events")
      .select("event_name,anonymous_id,product_id,created_at")
      .order("created_at", { ascending: false })
      .limit(analyticsRowLimit),
    supabase.from("newsletter_subscribers").select("id", { count: "exact", head: true }).eq("active", true),
    supabase.from("contact_messages").select("id", { count: "exact", head: true }).is("resolved_at", null),
  ]);

  for (const result of [
    orderResult,
    cakeResult,
    couponResult,
    reviewResult,
    notificationResult,
    subscriberResult,
    contactResult,
  ])
    if (result.error) throw result.error;
  const eventTrackingAvailable = !eventResult.error;
  if (eventResult.error && !["42P01", "PGRST205"].includes(eventResult.error.code)) throw eventResult.error;

  const orders: AnalyticsOrderRow[] = (orderResult.data ?? []).map((row) => {
    const payments = [...(row.payments ?? [])].sort((first, second) =>
      String(second.paid_at ?? second.created_at).localeCompare(String(first.paid_at ?? first.created_at)),
    );
    const payment = payments[0];
    return {
      id: row.id,
      email: row.email,
      status: row.status,
      createdAt: row.created_at,
      fulfilment: row.fulfilment as AnalyticsOrderRow["fulfilment"],
      deliveryZoneId: row.delivery_zone_id,
      couponId: row.coupon_id,
      subtotal: row.subtotal,
      discountTotal: row.discount_total,
      deliveryFee: row.delivery_fee,
      taxTotal: row.tax_total,
      grandTotal: row.grand_total,
      payment: payment
        ? {
            status: payment.status,
            amount: payment.amount,
            refundedAmount: payment.refunded_amount,
            paidAt: payment.paid_at,
          }
        : null,
      lines: (row.order_items ?? []).map((line) => ({
        productId: line.product_id,
        productName: line.product_name,
        quantity: line.quantity,
        finalPrice: line.final_price,
      })),
      events: (row.order_events ?? []).map((event) => ({
        eventType: event.event_type,
        toStatus: event.to_status,
        createdAt: event.created_at,
      })),
    };
  });
  const cakes: AnalyticsCakeRow[] = (cakeResult.data ?? []).map((row) => ({
    status: row.status,
    createdAt: row.created_at,
    quotedTotal: row.quoted_total,
    orderId: row.order_id,
  }));
  const coupons: AnalyticsCouponRow[] = (couponResult.data ?? []).map((row) => ({ id: row.id, code: row.code }));
  const reviews: AnalyticsReviewRow[] = (reviewResult.data ?? []).map((row) => ({
    rating: row.rating,
    status: row.status,
    createdAt: row.created_at,
  }));
  const notifications: AnalyticsNotificationRow[] = (notificationResult.data ?? []).map((row) => ({
    status: row.status,
    createdAt: row.created_at,
    sentAt: row.sent_at,
  }));
  const events: AnalyticsEventRow[] = (eventResult.data ?? []).map((row) => ({
    eventName: row.event_name,
    anonymousId: row.anonymous_id,
    productId: row.product_id,
    createdAt: row.created_at,
  }));

  return calculateAnalytics({
    orders,
    cakes,
    coupons,
    reviews,
    notifications,
    events,
    products,
    zones,
    activeSubscribers: subscriberResult.count ?? 0,
    unresolvedContacts: contactResult.count ?? 0,
    capped: [orders.length, cakes.length, coupons.length, reviews.length, notifications.length, events.length].some(
      (length) => length >= analyticsRowLimit,
    ),
    eventTrackingAvailable,
  });
}

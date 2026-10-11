import { getDashboardSummary } from "./admin-dashboard";
import type { Order } from "@/types";
import { getDeliveryZones, getProducts } from "./catalog";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAnalyticsSnapshot } from "./analytics";
import {
  defaultStoreCarousel,
  defaultMarketingExport,
  getBusinessSettings,
  getCakeConfiguration,
  getMarketingExport,
  getStoreAppearance,
  getStoreCarousel,
  getStorefrontContent,
} from "./settings";

export type QuoteDeliveryStatus = "PENDING" | "SENDING" | "SENT" | "FAILED";

export type AdminCakeRequest = {
  id: string;
  requestNumber: string;
  customerName: string;
  email: string;
  phone: string;
  status: string;
  configuration: Record<string, string>;
  requestedDate: string;
  estimatedTotal: number | null;
  quotedTotal: number | null;
  customerNote: string | null;
  referenceUrls: string[];
  orderId: string | null;
  orderNumber?: string | null;
  communications?: Array<{
    id: string;
    revision: number;
    createdAt: string;
    status: string;
    attempts: number;
    lastError: string | null;
  }>;
  quoteDelivery: {
    documentId: string;
    status: QuoteDeliveryStatus;
    attempts: number;
    lastError: string | null;
  } | null;
};
export type AdminCoupon = {
  id: string;
  code: string;
  type: "PERCENTAGE" | "FIXED";
  value: number;
  minimumOrder: number;
  maximumDiscount: number | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  active: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  productIds: string[];
  categoryIds: string[];
  usageCount: number;
};
export type AdminCategory = { id: string; name: string };
export type AdminReview = {
  id: string;
  customerName: string;
  rating: number;
  title: string | null;
  body: string;
  status: string;
  productName: string;
  verifiedPurchase: boolean;
};
export type AdminAuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  previousValue: unknown;
  newValue: unknown;
  metadata: Record<string, unknown>;
  createdAt: string;
  actorName: string;
  actorEmail: string;
};
export type AdminOrder = Order & {
  phone: string;
  currency: string;
  subtotal: number;
  discountTotal: number;
  deliveryFee: number;
  taxTotal: number;
  internalNote: string;
  customerNote: string;
  address: Record<string, string> | null;
  payment: { status: string; amount: number; refundedAmount: number; paidAt: string | null } | null;
  lines: Array<{
    id: string;
    productName: string;
    variantName: string;
    sku: string;
    unitPrice: number;
    quantity: number;
    discount: number;
    finalPrice: number;
    packQuantity?: number | null;
    configuration?: Record<string, string>;
  }>;
  events: Array<{
    id: string;
    eventType: string;
    fromStatus: string | null;
    toStatus: string | null;
    note: string | null;
    createdAt: string;
  }>;
};

export async function getAdminData(
  supabase: SupabaseClient,
  options: { includeAnalytics?: boolean; skipHistory?: boolean; recentLimit?: number; section?: string } = {},
) {
  const needs = (...sections: string[]) => !options.section || sections.includes(options.section);
  const emptyResult = () => Promise.resolve({ data: [], error: null });
  const [
    products,
    zones,
    orderResult,
    cakeResult,
    couponResult,
    categoryResult,
    reviewResult,
    content,
    business,
    cakeConfiguration,
    appearance,
    carousel,
    marketing,
    auditResult,
    dashboard,
  ] = await Promise.all([
    !options.section || ["analytics", "products", "coupons", "carousel", "marketing"].includes(options.section)
      ? getProducts({ includeInactive: true, client: supabase })
      : Promise.resolve([]),
    needs("delivery", "analytics", "products", "custom-cakes") ? getDeliveryZones(supabase, true) : Promise.resolve([]),
    options.skipHistory || options.section === "dashboard"
      ? Promise.resolve({ data: [], error: null })
      : fetchOrderRows(supabase, undefined, options.recentLimit ?? 5),
    options.skipHistory || options.section === "dashboard"
      ? Promise.resolve({ data: [], error: null })
      : fetchCakeRows(supabase),
    needs("coupons")
      ? supabase
          .from("coupons")
          .select(
            "id,code,type,value,minimum_order,maximum_discount,usage_limit,per_customer_limit,active,starts_at,expires_at,product_ids,category_ids,coupon_usages(count)",
          )
          .is("coupon_usages.released_at", null)
          .not("coupon_usages.committed_at", "is", null)
          .order("created_at", { ascending: false })
      : emptyResult(),
    needs("coupons", "products") ? supabase.from("categories").select("id,name").order("sort_order") : emptyResult(),
    needs("reviews")
      ? supabase
          .from("reviews")
          .select("id,customer_name,rating,title,body,status,verified_purchase,products(name)")
          .order("created_at", { ascending: false })
      : emptyResult(),
    getStorefrontContent(supabase),
    getBusinessSettings(supabase),
    needs("custom-cakes")
      ? getCakeConfiguration(supabase)
      : Promise.resolve({ options: [], cakeTypes: [], relationships: [], timezone: "America/Halifax" }),
    getStoreAppearance(supabase),
    needs("carousel") ? getStoreCarousel(supabase) : Promise.resolve(defaultStoreCarousel),
    needs("marketing") ? getMarketingExport(supabase) : Promise.resolve(defaultMarketingExport),
    needs("audit")
      ? supabase
          .from("admin_audit_logs")
          .select("id,action,entity_type,entity_id,previous_value,new_value,metadata,created_at,admins(name,email)")
          .order("created_at", { ascending: false })
          .limit(200)
      : emptyResult(),
    options.section === "dashboard" ? getDashboardSummary(supabase) : Promise.resolve(null),
  ]);
  for (const result of [orderResult, cakeResult, couponResult, categoryResult, reviewResult, auditResult])
    if (result.error) throw result.error;
  if (cakeResult.error) throw cakeResult.error;
  const orders = mapOrderRows(orderResult);
  const cakes = await mapCakeRows(supabase, cakeResult);
  const coupons: AdminCoupon[] = (couponResult.data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    type: row.type as AdminCoupon["type"],
    value: row.value,
    minimumOrder: row.minimum_order,
    maximumDiscount: row.maximum_discount,
    usageLimit: row.usage_limit,
    perCustomerLimit: row.per_customer_limit,
    active: row.active,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    productIds: row.product_ids ?? [],
    categoryIds: row.category_ids ?? [],
    usageCount: Array.isArray(row.coupon_usages) ? Number(row.coupon_usages[0]?.count ?? 0) : 0,
  }));
  const categories: AdminCategory[] = (categoryResult.data ?? []).map((row) => ({ id: row.id, name: row.name }));
  const reviews: AdminReview[] = (reviewResult.data ?? []).map((row) => ({
    id: row.id,
    customerName: row.customer_name,
    rating: row.rating,
    title: row.title,
    body: row.body,
    status: row.status,
    productName: row.products?.[0]?.name ?? "Product",
    verifiedPurchase: row.verified_purchase,
  }));
  const auditLogs: AdminAuditLog[] = (auditResult.data ?? []).map((row) => {
    const actor = Array.isArray(row.admins) ? row.admins[0] : row.admins;
    return {
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      previousValue: row.previous_value,
      newValue: row.new_value,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      createdAt: row.created_at,
      actorName: actor?.name ?? "Admin",
      actorEmail: actor?.email ?? "",
    };
  });
  const analytics = options.includeAnalytics ? await getAnalyticsSnapshot(supabase, products, zones) : null;
  return {
    products,
    zones,
    orders,
    cakes,
    coupons,
    categories,
    reviews,
    content,
    business,
    cakeConfiguration,
    appearance,
    carousel,
    marketing,
    auditLogs,
    analytics,
    dashboard,
  };
}

async function fetchOrderRows(db: SupabaseClient, identifier?: string, recentLimit = 5) {
  const query = db
    .from("orders")
    .select(
      "id,order_number,customer_name,email,phone,grand_total,subtotal,discount_total,delivery_fee,tax_total,currency,status,created_at,fulfilment,delivery_address_snapshot,customer_note,internal_note,order_items(id,product_name,variant_name,sku,unit_price,quantity,discount,final_price,product_snapshot),payments(status,amount,refunded_amount,paid_at),order_events(id,event_type,from_status,to_status,note,created_at)",
    )
    .order("created_at", { referencedTable: "payments", ascending: false })
    .order("created_at", { ascending: false });
  return identifier ? query.eq("order_number", identifier).limit(1) : query.limit(recentLimit);
}

async function fetchCakeRows(db: SupabaseClient, identifier?: string) {
  const query = db
    .from("custom_cake_orders")
    .select(
      "id,request_number,order_id,customer_name,email,phone,status,configuration,requested_date,estimated_total,quoted_total,customer_note,reference_urls,orders(order_number)",
    )
    .order("created_at", { ascending: false });
  return identifier ? query.eq("id", identifier).limit(1) : query.limit(5);
}

function mapOrderRows(orderResult: Pick<Awaited<ReturnType<typeof fetchOrderRows>>, "data">) {
  const orders: AdminOrder[] = (orderResult.data ?? []).map((row) => ({
    id: row.order_number,
    customer: row.customer_name,
    email: row.email,
    total: row.grand_total,
    status: row.status as Order["status"],
    date: row.created_at,
    items: row.order_items?.reduce((total, item) => total + item.quantity, 0) ?? 0,
    fulfilment: row.fulfilment as Order["fulfilment"],
    phone: row.phone,
    currency: row.currency,
    subtotal: row.subtotal,
    discountTotal: row.discount_total,
    deliveryFee: row.delivery_fee,
    taxTotal: row.tax_total,
    internalNote: row.internal_note ?? "",
    customerNote: row.customer_note ?? "",
    address: row.delivery_address_snapshot as Record<string, string> | null,
    payment: row.payments?.[0]
      ? {
          status: row.payments[0].status,
          amount: row.payments[0].amount,
          refundedAmount: row.payments[0].refunded_amount,
          paidAt: row.payments[0].paid_at,
        }
      : null,
    lines: (row.order_items ?? []).map((item) => ({
      id: item.id,
      productName: item.product_name,
      variantName: item.variant_name ?? "Standard",
      sku: item.sku ?? "",
      unitPrice: item.unit_price,
      quantity: item.quantity,
      discount: item.discount,
      finalPrice: item.final_price,
      packQuantity: item.product_snapshot?.packQuantity as number | null | undefined,
      configuration: item.product_snapshot?.configuration as Record<string, string> | undefined,
    })),
    events: (row.order_events ?? [])
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((event) => ({
        id: event.id,
        eventType: event.event_type,
        fromStatus: event.from_status,
        toStatus: event.to_status,
        note: event.note,
        createdAt: event.created_at,
      })),
  }));
  return orders;
}

async function mapCakeRows(
  supabase: SupabaseClient,
  cakeResult: Pick<Awaited<ReturnType<typeof fetchCakeRows>>, "data">,
) {
  const cakeIds = (cakeResult.data ?? []).map((row) => row.id);
  const quoteResults = await Promise.all(
    cakeIds.map((id) =>
      supabase
        .from("business_documents")
        .select("id,cake_order_id,revision,issued_at")
        .eq("kind", "QUOTE")
        .eq("cake_order_id", id)
        .order("revision", { ascending: false })
        .limit(25),
    ),
  );
  for (const result of quoteResults) if (result.error) throw result.error;
  const quoteDocuments = { data: quoteResults.flatMap((result) => result.data ?? []) };
  const latestQuoteByCake = new Map<string, { id: string }>();
  for (const document of quoteDocuments.data ?? [])
    if (document.cake_order_id && !latestQuoteByCake.has(document.cake_order_id))
      latestQuoteByCake.set(document.cake_order_id, document);
  const documentIds = (quoteDocuments.data ?? []).map((document) => document.id);
  const deliveryResult = documentIds.length
    ? await supabase
        .from("document_deliveries")
        .select("document_id,status,attempts,last_error")
        .in("document_id", documentIds)
    : { data: [], error: null };
  if (deliveryResult.error) throw deliveryResult.error;
  const deliveryByDocument = new Map((deliveryResult.data ?? []).map((delivery) => [delivery.document_id, delivery]));
  const cakes: AdminCakeRequest[] = await Promise.all(
    (cakeResult.data ?? []).map(async (row) => {
      const paths = row.reference_urls ?? [];
      const signed = paths.length
        ? await supabase.storage.from("cake-reference-images").createSignedUrls(paths, 60 * 60)
        : { data: [] };
      if ("error" in signed && signed.error) throw signed.error;
      const quoteDocument = latestQuoteByCake.get(row.id);
      const delivery = quoteDocument ? deliveryByDocument.get(quoteDocument.id) : undefined;
      return {
        id: row.id,
        requestNumber: row.request_number,
        customerName: row.customer_name,
        email: row.email,
        phone: row.phone,
        status: row.status,
        configuration: row.configuration as Record<string, string>,
        requestedDate: row.requested_date,
        estimatedTotal: row.estimated_total,
        quotedTotal: row.quoted_total,
        customerNote: row.customer_note,
        referenceUrls: (signed.data ?? []).flatMap((item) => (item.signedUrl ? [item.signedUrl] : [])),
        communications: (quoteDocuments.data ?? [])
          .filter((document) => document.cake_order_id === row.id)
          .map((document) => {
            const delivery = deliveryByDocument.get(document.id);
            return {
              id: document.id,
              revision: document.revision,
              createdAt: document.issued_at,
              status: delivery?.status ?? "NOT_QUEUED",
              attempts: delivery?.attempts ?? 0,
              lastError: delivery?.last_error ?? null,
            };
          }),
        orderId: row.order_id,
        orderNumber: (() => {
          const linked = row.orders as unknown as { order_number: string } | { order_number: string }[] | null;
          return (Array.isArray(linked) ? linked[0] : linked)?.order_number ?? null;
        })(),
        quoteDelivery:
          quoteDocument && delivery
            ? {
                documentId: quoteDocument.id,
                status: delivery.status as QuoteDeliveryStatus,
                attempts: delivery.attempts,
                lastError: delivery.last_error,
              }
            : null,
      };
    }),
  );
  return cakes;
}

export async function getAdminOrderDetails(db: SupabaseClient, number: string) {
  const result = await fetchOrderRows(db, number);
  if (result.error) throw result.error;
  return mapOrderRows(result)[0] ?? null;
}
export async function getAdminCakeDetails(db: SupabaseClient, id: string) {
  const result = await fetchCakeRows(db, id);
  if (result.error) throw result.error;
  return (await mapCakeRows(db, result))[0] ?? null;
}

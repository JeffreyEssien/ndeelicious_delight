import type { Order } from "@/types";
import { getDeliveryZones, getProducts } from "./catalog";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getBusinessSettings, getCakeConfiguration, getStoreAppearance, getStorefrontContent } from "./settings";

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

export async function getAdminData(supabase: SupabaseClient) {
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
    auditResult,
  ] = await Promise.all([
    getProducts({ includeInactive: true, client: supabase }),
    getDeliveryZones(supabase, true),
    supabase
      .from("orders")
      .select(
        "id,order_number,customer_name,email,phone,grand_total,subtotal,discount_total,delivery_fee,tax_total,currency,status,created_at,fulfilment,delivery_address_snapshot,customer_note,internal_note,order_items(id,product_name,variant_name,sku,unit_price,quantity,discount,final_price),payments(status,amount,refunded_amount,paid_at),order_events(id,event_type,from_status,to_status,note,created_at)",
      )
      .order("created_at", { referencedTable: "payments", ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("custom_cake_orders")
      .select(
        "id,request_number,customer_name,email,phone,status,configuration,requested_date,estimated_total,quoted_total,customer_note,reference_urls",
      )
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("coupons")
      .select(
        "id,code,type,value,minimum_order,maximum_discount,usage_limit,per_customer_limit,active,starts_at,expires_at,product_ids,category_ids,coupon_usages(count)",
      )
      .is("coupon_usages.released_at", null)
      .not("coupon_usages.committed_at", "is", null)
      .order("created_at", { ascending: false }),
    supabase.from("categories").select("id,name").order("sort_order"),
    supabase
      .from("reviews")
      .select("id,customer_name,rating,title,body,status,products(name)")
      .order("created_at", { ascending: false }),
    getStorefrontContent(supabase),
    getBusinessSettings(supabase),
    getCakeConfiguration(supabase),
    getStoreAppearance(supabase),
    supabase
      .from("admin_audit_logs")
      .select("id,action,entity_type,entity_id,previous_value,new_value,metadata,created_at,admins(name,email)")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
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
  const cakes: AdminCakeRequest[] = await Promise.all(
    (cakeResult.data ?? []).map(async (row) => {
      const paths = row.reference_urls ?? [];
      const signed = paths.length
        ? await supabase.storage.from("cake-reference-images").createSignedUrls(paths, 60 * 60)
        : { data: [] };
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
      };
    }),
  );
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
    auditLogs,
  };
}

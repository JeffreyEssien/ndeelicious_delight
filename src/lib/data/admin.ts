import type { Order } from "@/types";
import { getDeliveryZones, getProducts } from "./catalog";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getBusinessSettings, getCakeConfiguration, getStorefrontContent } from "./settings";

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
  ] = await Promise.all([
    getProducts({ includeInactive: true, client: supabase }),
    getDeliveryZones(supabase, true),
    supabase
      .from("orders")
      .select("id,order_number,customer_name,email,grand_total,status,created_at,fulfilment,order_items(count)")
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
  ]);
  const orders: Order[] = (orderResult.data ?? []).map((row) => ({
    id: row.order_number,
    customer: row.customer_name,
    email: row.email,
    total: row.grand_total,
    status: row.status as Order["status"],
    date: row.created_at,
    items: Array.isArray(row.order_items) ? Number(row.order_items[0]?.count ?? 0) : 0,
    fulfilment: row.fulfilment as Order["fulfilment"],
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
  return { products, zones, orders, cakes, coupons, categories, reviews, content, business, cakeConfiguration };
}

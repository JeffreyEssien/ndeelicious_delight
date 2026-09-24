import type { SupabaseClient } from "@supabase/supabase-js";
import { CommerceError, type CouponRule } from "@/features/checkout/pricing";
import { createServiceClient } from "@/lib/supabase/service";

const couponErrors: Record<string, string> = {
  COUPON_INACTIVE: "That coupon is not active.",
  COUPON_NOT_STARTED: "That coupon is not active yet.",
  COUPON_EXPIRED: "That coupon has expired.",
  COUPON_USED_UP: "That coupon has reached its usage limit.",
  COUPON_CUSTOMER_LIMIT: "You have already used this coupon the maximum number of times.",
  COUPON_MINIMUM: "This order does not meet the coupon minimum.",
  COUPON_NOT_APPLICABLE: "That coupon does not apply to these items.",
  COUPON_AMOUNT_CHANGED: "The coupon total changed. Please review your order and try again.",
};

export async function getCoupon(code?: string): Promise<CouponRule | undefined> {
  if (!code) return undefined;
  const normalized = code.trim().toUpperCase();
  const db = createServiceClient();
  const { data, error } = await db
    .from("coupons")
    .select(
      "id,code,type,value,minimum_order,maximum_discount,starts_at,expires_at,usage_limit,per_customer_limit,active,product_ids,category_ids",
    )
    .eq("code", normalized)
    .maybeSingle();
  if (error) throw error;
  if (!data) return undefined;

  const now = new Date().toISOString();
  const { count, error: countError } = await db
    .from("coupon_usages")
    .select("id", { count: "exact", head: true })
    .eq("coupon_id", data.id)
    .is("released_at", null)
    .or(`committed_at.not.is.null,expires_at.gt.${now}`);
  if (countError) throw countError;

  return {
    id: data.id,
    code: data.code,
    type: data.type,
    value: data.value,
    minimumOrder: data.minimum_order,
    maximumDiscount: data.maximum_discount ?? undefined,
    startsAt: data.starts_at ? new Date(data.starts_at) : undefined,
    expiresAt: data.expires_at ? new Date(data.expires_at) : undefined,
    usageLimit: data.usage_limit ?? undefined,
    usageCount: count ?? 0,
    perCustomerLimit: data.per_customer_limit ?? undefined,
    active: data.active,
    productIds: data.product_ids,
    categoryIds: data.category_ids,
  };
}

export async function claimOrderCoupon(db: SupabaseClient, orderId: string, holdMinutes = 60) {
  const { error } = await db.rpc("claim_order_coupon", { p_order_id: orderId, p_hold_minutes: holdMinutes });
  if (!error) return;
  const code = Object.keys(couponErrors).find((candidate) => error.message.includes(candidate));
  if (code) throw new CommerceError(code, couponErrors[code]);
  throw error;
}

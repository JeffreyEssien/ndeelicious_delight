import type { CouponRule } from "@/features/checkout/pricing";
import { previewCoupon } from "@/features/checkout/pricing";
import { createServiceClient } from "@/lib/supabase/service";

export async function getCoupon(code?:string):Promise<CouponRule|undefined>{
  if(!code)return undefined;const normalized=code.trim().toUpperCase();
  try{
    const db=createServiceClient();const {data,error}=await db.from("coupons").select("id,code,type,value,minimum_order,maximum_discount,starts_at,expires_at,usage_limit,active,product_ids,category_ids").eq("code",normalized).maybeSingle();
    if(error||!data)return undefined;const {count}=await db.from("coupon_usages").select("id",{count:"exact",head:true}).eq("coupon_id",data.id);
    return {id:data.id,code:data.code,type:data.type,value:data.value,minimumOrder:data.minimum_order,maximumDiscount:data.maximum_discount??undefined,startsAt:data.starts_at?new Date(data.starts_at):undefined,expiresAt:data.expires_at?new Date(data.expires_at):undefined,usageLimit:data.usage_limit??undefined,usageCount:count??0,active:data.active,productIds:data.product_ids,categoryIds:[]};
  }catch{return normalized===previewCoupon.code?previewCoupon:undefined}
}

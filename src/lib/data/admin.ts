import type { Order } from "@/types";
import { getDeliveryZones, getProducts } from "./catalog";
import { createClient } from "@/lib/supabase/server";

export type AdminCakeRequest={id:string;requestNumber:string;customerName:string;email:string;phone:string;status:string;configuration:Record<string,string>;requestedDate:string;estimatedTotal:number|null;quotedTotal:number|null;customerNote:string|null};
export type AdminCoupon={id:string;code:string;type:string;value:number;minimumOrder:number;maximumDiscount:number|null;usageLimit:number|null;active:boolean;expiresAt:string|null};
export type AdminReview={id:string;customerName:string;rating:number;title:string|null;body:string;status:string;productName:string};

export async function getAdminData() {
  const supabase = await createClient();
  const [products, zones, orderResult, cakeResult, couponResult, reviewResult] = await Promise.all([
    getProducts({ includeInactive: true, fallback: false }), getDeliveryZones(),
    supabase.from("orders").select("id,order_number,customer_name,email,grand_total,status,created_at,fulfilment,order_items(count)").order("created_at", { ascending: false }).limit(100),
    supabase.from("custom_cake_orders").select("id,request_number,customer_name,email,phone,status,configuration,requested_date,estimated_total,quoted_total,customer_note").order("created_at",{ascending:false}).limit(100),
    supabase.from("coupons").select("id,code,type,value,minimum_order,maximum_discount,usage_limit,active,expires_at").order("created_at",{ascending:false}),
    supabase.from("reviews").select("id,customer_name,rating,title,body,status,products(name)").order("created_at",{ascending:false}),
  ]);
  const orders: Order[] = (orderResult.data ?? []).map((row) => ({
    id: row.order_number, customer: row.customer_name, email: row.email, total: row.grand_total,
    status: row.status as Order["status"], date: row.created_at,
    items: Array.isArray(row.order_items) ? Number(row.order_items[0]?.count ?? 0) : 0,
    fulfilment: row.fulfilment as Order["fulfilment"],
  }));
  const cakes:AdminCakeRequest[]=(cakeResult.data??[]).map(row=>({id:row.id,requestNumber:row.request_number,customerName:row.customer_name,email:row.email,phone:row.phone,status:row.status,configuration:row.configuration as Record<string,string>,requestedDate:row.requested_date,estimatedTotal:row.estimated_total,quotedTotal:row.quoted_total,customerNote:row.customer_note}));
  const coupons:AdminCoupon[]=(couponResult.data??[]).map(row=>({id:row.id,code:row.code,type:row.type,value:row.value,minimumOrder:row.minimum_order,maximumDiscount:row.maximum_discount,usageLimit:row.usage_limit,active:row.active,expiresAt:row.expires_at}));
  const reviews:AdminReview[]=(reviewResult.data??[]).map(row=>({id:row.id,customerName:row.customer_name,rating:row.rating,title:row.title,body:row.body,status:row.status,productName:row.products?.[0]?.name??"Product"}));
  return { products, zones, orders, cakes, coupons, reviews };
}

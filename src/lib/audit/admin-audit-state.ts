import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminAuditTarget =
  | { type: "product"; id: string }
  | { type: "order"; orderNumber: string }
  | { type: "site-setting"; key: string }
  | { type: "cake-order"; id: string }
  | { type: "cake-options" }
  | { type: "review"; id: string }
  | { type: "coupons" }
  | { type: "delivery-zones" };

const productFields =
  "id,category_id,name,slug,short_description,description,base_price,discount_price,sku,status,featured,track_inventory,stock_quantity,low_stock_threshold,ingredients,allergens,storage_instructions,preparation_instructions,product_variants(id,name,sku,price_adjustment,stock_quantity,active),product_images(id,url,alt_text,sort_order,storage_path)";

export async function readAdminAuditState(db: SupabaseClient, target: AdminAuditTarget): Promise<unknown> {
  if (target.type === "product") {
    const { data, error } = await db.from("products").select(productFields).eq("id", target.id).maybeSingle();
    if (error) throw error;
    return data;
  }
  if (target.type === "order") {
    const { data, error } = await db
      .from("orders")
      .select("id,order_number,status,internal_note,updated_at")
      .eq("order_number", target.orderNumber)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
  if (target.type === "site-setting") {
    const { data, error } = await db.from("site_settings").select("key,value").eq("key", target.key).maybeSingle();
    if (error) throw error;
    return data;
  }
  if (target.type === "cake-order") {
    const { data, error } = await db
      .from("custom_cake_orders")
      .select("id,status,quoted_total,quote_expires_at,updated_at")
      .eq("id", target.id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
  if (target.type === "review") {
    const { data, error } = await db.from("reviews").select("id,status").eq("id", target.id).maybeSingle();
    if (error) throw error;
    return data;
  }
  if (target.type === "cake-options") {
    const { data, error } = await db
      .from("custom_cake_options")
      .select("id,type,name,description,price_adjustment,quote_required,active,sort_order")
      .order("sort_order");
    if (error) throw error;
    return data ?? [];
  }
  if (target.type === "coupons") {
    const { data, error } = await db
      .from("coupons")
      .select(
        "id,code,type,value,minimum_order,maximum_discount,usage_limit,per_customer_limit,active,starts_at,expires_at,product_ids,category_ids",
      )
      .order("code");
    if (error) throw error;
    return data ?? [];
  }
  const { data, error } = await db
    .from("delivery_zones")
    .select("id,name,fee,minimum_order,estimated_time,active,sort_order")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

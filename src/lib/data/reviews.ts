import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import type { PublicReview } from "@/types/content";

export async function getApprovedReviews(productId?: string, client?: SupabaseClient): Promise<PublicReview[]> {
  const db = client ?? createServiceClient();
  let query = db
    .from("reviews")
    .select("id,customer_name,rating,title,body,created_at,verified_purchase")
    .eq("status", "APPROVED")
    .eq("verified_purchase", true)
    .order("created_at", { ascending: false })
    .limit(productId ? 12 : 1);
  if (productId) query = query.eq("product_id", productId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    customerName: row.customer_name,
    rating: row.rating,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    verifiedPurchase: row.verified_purchase,
  }));
}

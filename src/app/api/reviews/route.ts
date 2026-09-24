import { z } from "zod";
import { isSameOrigin } from "@/lib/auth/validation";
import { createServiceClient } from "@/lib/supabase/service";

const schema = z.object({
  productId: z.uuid(),
  customerName: z.string().trim().min(2).max(100),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(10).max(2000),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Please complete every review field." }, { status: 400 });
  try {
    const db = createServiceClient();
    const { data: product, error: productError } = await db
      .from("products")
      .select("id")
      .eq("id", parsed.data.productId)
      .in("status", ["ACTIVE", "OUT_OF_STOCK"])
      .maybeSingle();
    if (productError) throw productError;
    if (!product) return Response.json({ error: "That product is unavailable." }, { status: 404 });
    const { error } = await db.from("reviews").insert({
      product_id: product.id,
      customer_name: parsed.data.customerName,
      rating: parsed.data.rating,
      title: parsed.data.title,
      body: parsed.data.body,
      status: "PENDING",
    });
    if (error) throw error;
    return Response.json({ ok: true }, { status: 201 });
  } catch {
    return Response.json({ error: "We couldn’t save your review. Please try again." }, { status: 500 });
  }
}

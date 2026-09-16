import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";

const schema = z.object({ order: z.string().trim().regex(/^ND-\d+$/i), email: z.string().trim().email() });
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = schema.safeParse({ order: url.searchParams.get("order"), email: url.searchParams.get("email") });
  if (!parsed.success) return Response.json({ error: "Check your order number and email." }, { status: 400 });
  const { data, error } = await createServiceClient().from("orders")
    .select("order_number,status,fulfilment,created_at,updated_at")
    .eq("order_number", parsed.data.order.toUpperCase()).eq("email", parsed.data.email.toLowerCase()).maybeSingle();
  if (error || !data) return Response.json({ error: "No matching order was found." }, { status: 404 });
  return Response.json({ order: data }, { headers: { "Cache-Control": "no-store" } });
}

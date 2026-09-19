import { z } from "zod";
import { isSameOrigin } from "@/lib/auth/validation";
import { isActiveAdmin } from "@/lib/auth/admin-auth";
import { createClient } from "@/lib/supabase/server";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("product-status"),
    id: z.uuid(),
    status: z.enum(["ACTIVE", "OUT_OF_STOCK", "DRAFT", "ARCHIVED"]),
  }),
  z.object({ action: z.literal("inventory"), id: z.uuid(), quantity: z.number().int().min(0) }),
  z.object({
    action: z.literal("order-status"),
    orderNumber: z.string(),
    status: z.enum([
      "PAID",
      "CONFIRMED",
      "PREPARING",
      "READY",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "CANCELLED",
      "REFUNDED",
      "FAILED",
    ]),
  }),
  z.object({ action: z.literal("theme"), theme: z.enum(["berry", "purple", "sunrise"]) }),
  z.object({ action: z.literal("cake-quote"), id: z.uuid(), quotedTotal: z.number().int().positive() }),
  z.object({ action: z.literal("review-status"), id: z.uuid(), status: z.enum(["APPROVED", "REJECTED"]) }),
  z.object({ action: z.literal("coupon-create") }),
  z.object({
    action: z.literal("delivery-zones"),
    zones: z.array(
      z.object({
        id: z.string(),
        name: z.string().min(2),
        fee: z.number().int().min(0),
        estimate: z.string().max(100),
        active: z.boolean(),
      }),
    ),
  }),
  z.object({
    action: z.literal("settings"),
    key: z.enum(["content", "business"]),
    value: z.record(z.string(), z.unknown()),
  }),
]);

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid admin update." }, { status: 400 });
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || !(await isActiveAdmin(supabase, data.user.id)))
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  const input = parsed.data;
  let error: { message: string } | null | undefined;
  if (input.action === "product-status")
    ({ error } = await supabase
      .from("products")
      .update({ status: input.status, updated_at: new Date().toISOString() })
      .eq("id", input.id));
  if (input.action === "inventory")
    ({ error } = await supabase
      .from("products")
      .update({
        stock_quantity: input.quantity,
        status: input.quantity === 0 ? "OUT_OF_STOCK" : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id));
  if (input.action === "order-status")
    ({ error } = await supabase
      .from("orders")
      .update({ status: input.status, updated_at: new Date().toISOString() })
      .eq("order_number", input.orderNumber));
  if (input.action === "theme")
    ({ error } = await supabase
      .from("site_settings")
      .upsert({ key: "theme", value: input.theme, updated_at: new Date().toISOString() }, { onConflict: "key" }));
  if (input.action === "cake-quote")
    ({ error } = await supabase
      .from("custom_cake_orders")
      .update({
        quoted_total: input.quotedTotal,
        status: "QUOTE_SENT",
        quote_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id));
  if (input.action === "review-status")
    ({ error } = await supabase.from("reviews").update({ status: input.status }).eq("id", input.id));
  if (input.action === "coupon-create")
    ({ error } = await supabase.from("coupons").insert({
      code: `DRAFT${Date.now().toString().slice(-6)}`,
      type: "PERCENTAGE",
      value: 10,
      minimum_order: 0,
      active: false,
    }));
  if (input.action === "delivery-zones") {
    const ids = input.zones.map((zone) => zone.id).filter((id) => z.string().uuid().safeParse(id).success);
    const current = await supabase.from("delivery_zones").select("id");
    if (current.error) error = current.error;
    if (!error) {
      const remove = (current.data ?? []).map((row) => row.id).filter((id) => !ids.includes(id));
      if (remove.length) {
        const result = await supabase.from("delivery_zones").delete().in("id", remove);
        error = result.error;
      }
    }
    if (!error)
      for (const [index, zone] of input.zones.entries()) {
        const values = {
          name: zone.name,
          fee: zone.fee,
          estimated_time: zone.estimate,
          active: zone.active,
          sort_order: index,
        };
        const result = z.string().uuid().safeParse(zone.id).success
          ? await supabase.from("delivery_zones").update(values).eq("id", zone.id)
          : await supabase.from("delivery_zones").insert(values);
        if (result.error) {
          error = result.error;
          break;
        }
      }
  }
  if (input.action === "settings")
    ({ error } = await supabase
      .from("site_settings")
      .upsert({ key: input.key, value: input.value, updated_at: new Date().toISOString() }, { onConflict: "key" }));
  if (error) return Response.json({ error: "The update could not be saved." }, { status: 500 });
  return Response.json({ ok: true });
}

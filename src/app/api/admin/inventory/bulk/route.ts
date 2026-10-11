import { z } from "zod";
import { requireAdminRequest } from "@/lib/auth/admin-request";
import { invalidateStorefrontCache } from "@/lib/cache/storefront";
const row = z.object({
  productId: z.uuid(),
  variantId: z.uuid(),
  expected: z.number().int().min(0).max(2147483647),
  mode: z.enum(["add", "remove", "set"]),
  quantity: z.number().int().min(0).max(2147483647),
});
export async function POST(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const parsed = z.object({ rows: z.array(row).min(1).max(100) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success || new Set(parsed.data.rows.map((value) => value.variantId)).size !== parsed.data.rows.length)
    return Response.json(
      { error: "Provide 1–100 unique variants with whole, nonnegative quantities." },
      { status: 400 },
    );
  const results = [];
  for (const input of parsed.data.rows) {
    const { data, error } = await auth.db.rpc("admin_adjust_inventory", {
      p_product_id: input.productId,
      p_variant_id: input.variantId,
      p_expected: input.expected,
      p_mode: input.mode,
      p_quantity: input.quantity,
      p_admin_id: auth.admin.id,
      p_session_id: auth.sessionId,
    });
    results.push({
      variantId: input.variantId,
      saved: !error,
      quantity: error ? undefined : data,
      error: error
        ? error.message.includes("INVENTORY_CHANGED")
          ? "Stock changed. Export fresh quantities before retrying."
          : error.message.includes("STOCK_BELOW_RESERVED")
            ? "Stock is reserved for orders."
            : "Adjustment rejected. Check product and quantity."
        : undefined,
    });
  }
  if (results.some((value) => value.saved)) invalidateStorefrontCache();
  return Response.json({ results });
}

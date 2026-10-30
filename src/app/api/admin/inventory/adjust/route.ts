import { z } from "zod";
import { requireAdminRequest } from "@/lib/auth/admin-request";
import { invalidateStorefrontCache } from "@/lib/cache/storefront";
const schema = z.object({
  productId: z.uuid(),
  variantId: z.uuid(),
  expected: z.number().int().min(0).max(2147483647),
  mode: z.enum(["add", "remove", "set"]),
  quantity: z.number().int().min(0).max(2147483647),
  reason: z.string().trim().max(200).optional(),
});
export async function POST(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a whole, nonnegative quantity." }, { status: 400 });
  const input = parsed.data;
  const { data, error } = await auth.db.rpc("admin_adjust_inventory", {
    p_product_id: input.productId,
    p_variant_id: input.variantId,
    p_expected: input.expected,
    p_mode: input.mode,
    p_quantity: input.quantity,
    p_admin_id: auth.admin.id,
    p_session_id: auth.sessionId,
    p_reason: input.reason || null,
  });
  if (error) {
    const changed = error.message.includes("INVENTORY_CHANGED");
    const reserved = error.message.includes("STOCK_BELOW_RESERVED");
    return Response.json(
      {
        error: changed
          ? "Stock changed while you were editing. Refresh before saving again."
          : reserved
            ? "Stock cannot be reduced below quantities reserved for orders."
            : "Stock could not be saved. Check the quantity and try again.",
      },
      { status: changed || reserved ? 409 : 400 },
    );
  }
  invalidateStorefrontCache();
  return Response.json({ quantity: data });
}

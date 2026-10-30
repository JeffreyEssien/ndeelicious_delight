import { z } from "zod";
import { requireAdminRequest } from "@/lib/auth/admin-request";
import { getProducts } from "@/lib/data/catalog";
import { getInventoryInsights } from "@/lib/data/inventory-insights";
const schema = z.object({
  q: z.string().trim().max(200).default(""),
  category: z.enum(["ATTENTION", "LOW", "OUT", "ALL", "UNTRACKED", "INACTIVE"]).default("ATTENTION"),
  sort: z.enum(["name", "quantity"]).default("name"),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  size: z.coerce
    .number()
    .refine((value) => [25, 50, 100].includes(value))
    .default(25),
});
export async function GET(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const parsed = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Check your inventory filters." }, { status: 400 });
  const { data, error } = await auth.db.rpc("admin_inventory_page", { p_filters: parsed.data });
  if (error || !data || !Array.isArray(data.ids))
    return Response.json({ error: "Inventory could not be loaded. Retry." }, { status: 503 });
  try {
    const products = await getProducts({ client: auth.db, includeInactive: true, ids: data.ids });
    const byId = new Map(products.map((p) => [p.id, p]));
    // Extras are best-effort: the counts still load if they can't be worked out.
    const insights = await getInventoryInsights(
      auth.db,
      products.flatMap((product) => product.variants.map((variant) => variant.id)),
    ).catch(() => ({}));
    return Response.json(
      {
        ...data,
        products: (data.ids as string[]).flatMap((id) => (byId.has(id) ? [byId.get(id)] : [])),
        insights,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json({ error: "Inventory could not be loaded. Retry." }, { status: 503 });
  }
}

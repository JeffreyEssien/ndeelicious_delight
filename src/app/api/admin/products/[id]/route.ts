import { requireAdminRequest } from "@/lib/auth/admin-request";
import { invalidateStorefrontCache } from "@/lib/cache/storefront";
import { applyProductCollection, productSaveArguments, productSaveError } from "@/lib/data/product-write";
import { categorySlug, productInputSchema } from "@/validations/product";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const parsed = productInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the product details." }, { status: 400 });
  const { id } = await context.params;
  const { data: category } = await auth.db
    .from("categories")
    .select("id")
    .eq("slug", categorySlug(parsed.data.category))
    .single();
  if (!category) return Response.json({ error: "Product category is missing." }, { status: 400 });
  const { error } = await auth.db.rpc("admin_save_product", {
    p_id: id,
    ...productSaveArguments(parsed.data, category.id),
    p_admin_id: auth.admin.id,
    p_session_id: auth.sessionId,
  });
  if (error) {
    const result = productSaveError(error);
    return Response.json({ error: result.error }, { status: result.status });
  }
  await applyProductCollection(auth.db, id, parsed.data.category, parsed.data.collectionId);
  invalidateStorefrontCache();
  return Response.json({ ok: true, id });
}

export async function POST(request: Request, context: Context) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const { id: sourceId } = await context.params;
  const { data: id, error } = await auth.db.rpc("admin_duplicate_product", {
    p_source_id: sourceId,
    p_admin_id: auth.admin.id,
    p_session_id: auth.sessionId,
  });
  if (error) {
    const result = productSaveError(error);
    return Response.json({ error: result.error }, { status: result.status });
  }
  invalidateStorefrontCache();
  return Response.json({ ok: true, id }, { status: 201 });
}

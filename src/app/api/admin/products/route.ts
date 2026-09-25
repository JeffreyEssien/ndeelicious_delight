import { recordAdminAudit } from "@/lib/audit/admin-audit";
import { readAdminAuditState } from "@/lib/audit/admin-audit-state";
import { requireAdminRequest } from "@/lib/auth/admin-request";
import { productRow } from "@/lib/data/product-write";
import { categorySlug, productInputSchema } from "@/validations/product";

export async function POST(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const parsed = productInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the product details." }, { status: 400 });
  }

  const { db } = auth;
  const { data: category, error: categoryError } = await db
    .from("categories")
    .select("id")
    .eq("slug", categorySlug(parsed.data.category))
    .single();
  if (categoryError || !category) return Response.json({ error: "Product category is missing." }, { status: 400 });

  const { data: product, error } = await db
    .from("products")
    .insert(productRow(parsed.data, category.id))
    .select("id")
    .single();
  if (error || !product) {
    const duplicate = error?.code === "23505";
    return Response.json(
      { error: duplicate ? "That slug or SKU is already in use." : "Product could not be saved." },
      { status: duplicate ? 409 : 500 },
    );
  }

  const { error: variantError } = await db.from("product_variants").insert(
    parsed.data.variants.map((variant) => ({
      product_id: product.id,
      name: variant.name,
      price_adjustment: variant.priceAdjustment,
      stock_quantity: variant.stockQuantity,
      active: variant.active,
    })),
  );
  if (variantError) {
    await db.from("products").delete().eq("id", product.id);
    return Response.json({ error: "Product variants could not be saved." }, { status: 500 });
  }
  try {
    const newValue = await readAdminAuditState(db, { type: "product", id: product.id });
    await recordAdminAudit(db, auth, {
      action: "PRODUCT_CREATED",
      entityType: "product",
      entityId: product.id,
      previousValue: null,
      newValue,
    });
  } catch {
    return Response.json(
      { error: "The product was saved, but its audit record could not be verified." },
      { status: 500 },
    );
  }
  return Response.json({ ok: true, id: product.id }, { status: 201 });
}

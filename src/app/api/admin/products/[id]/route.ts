import { requireAdminRequest } from "@/lib/auth/admin-request";
import { productRow } from "@/lib/data/product-write";
import { categorySlug, productInputSchema } from "@/validations/product";

type Context = { params: Promise<{ id: string }> };
type SourceVariant = { name: string; price_adjustment: number; stock_quantity: number; active: boolean };
type SourceImage = { url: string; alt_text: string; sort_order: number; storage_path: string | null };

export async function PATCH(request: Request, context: Context) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const parsed = productInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the product details." }, { status: 400 });
  }
  const { id } = await context.params;
  const { db } = auth;
  const [{ data: category }, { data: existingVariants }, { data: existingImages }] = await Promise.all([
    db.from("categories").select("id").eq("slug", categorySlug(parsed.data.category)).single(),
    db.from("product_variants").select("id").eq("product_id", id),
    db.from("product_images").select("id").eq("product_id", id),
  ]);
  if (!category) return Response.json({ error: "Product category is missing." }, { status: 400 });

  const variantIds = new Set((existingVariants ?? []).map((variant) => variant.id));
  const imageIds = new Set((existingImages ?? []).map((image) => image.id));
  if (parsed.data.variants.some((variant) => variant.id && !variantIds.has(variant.id))) {
    return Response.json({ error: "A variant does not belong to this product." }, { status: 400 });
  }
  if (parsed.data.images.some((image) => !imageIds.has(image.id))) {
    return Response.json({ error: "An image does not belong to this product." }, { status: 400 });
  }

  const { error: productError } = await db.from("products").update(productRow(parsed.data, category.id)).eq("id", id);
  if (productError) {
    const duplicate = productError.code === "23505";
    return Response.json(
      { error: duplicate ? "That slug or SKU is already in use." : "Product could not be updated." },
      { status: duplicate ? 409 : 500 },
    );
  }

  const submittedVariantIds = new Set(parsed.data.variants.flatMap((variant) => (variant.id ? [variant.id] : [])));
  for (const variant of parsed.data.variants) {
    const values = {
      product_id: id,
      name: variant.name,
      sku: variant.sku || null,
      price_adjustment: variant.priceAdjustment,
      stock_quantity: variant.stockQuantity,
      active: variant.active,
      updated_at: new Date().toISOString(),
    };
    const result = variant.id
      ? await db.from("product_variants").update(values).eq("id", variant.id).eq("product_id", id)
      : await db.from("product_variants").insert(values);
    if (result.error) return Response.json({ error: "A product variant could not be updated." }, { status: 500 });
  }
  for (const variantId of variantIds) {
    if (!submittedVariantIds.has(variantId)) {
      const { error } = await db
        .from("product_variants")
        .update({ active: false })
        .eq("id", variantId)
        .eq("product_id", id);
      if (error) return Response.json({ error: "A removed variant could not be archived." }, { status: 500 });
    }
  }

  const submittedImageIds = new Set(parsed.data.images.map((image) => image.id));
  for (const image of parsed.data.images) {
    const { error } = await db
      .from("product_images")
      .update({ alt_text: image.altText, sort_order: image.sortOrder })
      .eq("id", image.id)
      .eq("product_id", id);
    if (error) return Response.json({ error: "Product image ordering could not be updated." }, { status: 500 });
  }
  for (const imageId of imageIds) {
    if (!submittedImageIds.has(imageId)) {
      const { error } = await db.from("product_images").delete().eq("id", imageId).eq("product_id", id);
      if (error) return Response.json({ error: "A product image could not be removed." }, { status: 500 });
    }
  }

  return Response.json({ ok: true, id });
}

export async function POST(request: Request, context: Context) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const { db } = auth;
  const { data: source, error: sourceError } = await db
    .from("products")
    .select(
      "*,product_variants(name,price_adjustment,stock_quantity,active),product_images(url,alt_text,sort_order,storage_path)",
    )
    .eq("id", id)
    .single();
  if (sourceError || !source) return Response.json({ error: "Product could not be found." }, { status: 404 });

  const suffix = Date.now().toString(36);
  const { data: copy, error } = await db
    .from("products")
    .insert({
      category_id: source.category_id,
      name: `${source.name.slice(0, 142)} (Copy)`,
      slug: `${source.slug.slice(0, 165)}-copy-${suffix}`,
      short_description: source.short_description,
      description: source.description,
      base_price: source.base_price,
      discount_price: source.discount_price,
      sku: null,
      status: "DRAFT",
      featured: false,
      track_inventory: source.track_inventory,
      stock_quantity: source.stock_quantity,
      low_stock_threshold: source.low_stock_threshold,
      ingredients: source.ingredients,
      allergens: source.allergens,
      storage_instructions: source.storage_instructions,
      preparation_instructions: source.preparation_instructions,
    })
    .select("id")
    .single();
  if (error || !copy) return Response.json({ error: "Product could not be duplicated." }, { status: 500 });

  const variants = (source.product_variants ?? []) as SourceVariant[];
  if (variants.length) {
    const { error: variantError } = await db.from("product_variants").insert(
      variants.map((variant) => ({
        product_id: copy.id,
        name: variant.name,
        sku: null,
        price_adjustment: variant.price_adjustment,
        stock_quantity: variant.stock_quantity,
        active: variant.active,
      })),
    );
    if (variantError)
      return Response.json({ error: "The product copy was created without its variants." }, { status: 500 });
  }
  const images = (source.product_images ?? []) as SourceImage[];
  if (images.length) {
    const { error: imageError } = await db.from("product_images").insert(
      images.map((image) => ({
        product_id: copy.id,
        url: image.url,
        alt_text: image.alt_text,
        sort_order: image.sort_order,
        storage_path: image.storage_path,
      })),
    );
    if (imageError)
      return Response.json({ error: "The product copy was created without its images." }, { status: 500 });
  }
  return Response.json({ ok: true, id: copy.id }, { status: 201 });
}

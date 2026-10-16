import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductInput } from "@/validations/product";

// Set the product's sub-category after the save RPC runs. Guarded so a category can only
// receive sub-categories that belong to it.
export async function applyProductCollection(
  db: SupabaseClient,
  productId: string,
  category: string,
  collectionId: string | null | undefined,
) {
  let value = collectionId?.length ? collectionId : null;
  if (value) {
    const { data } = await db.from("collections").select("parent").eq("id", value).maybeSingle();
    if (!data || data.parent !== category) value = null;
  }
  await db.from("products").update({ collection_id: value }).eq("id", productId);
}

export function productRow(input: ProductInput, categoryId: string) {
  return {
    category_id: categoryId,
    shopping_mode: input.shoppingMode,
    tax_class: input.taxClass,
    preparation_hours: input.preparationHours,
    name: input.name,
    slug: input.slug,
    short_description: input.shortDescription,
    description: input.description,
    base_price: input.price,
    discount_price: input.discountPrice,
    sku: null,
    status: input.status,
    featured: input.featured,
    track_inventory: input.trackInventory,
    stock_quantity: input.variants
      .filter((variant) => variant.active)
      .reduce((sum, variant) => sum + variant.stockQuantity, 0),
    low_stock_threshold: input.lowStockThreshold,
    ingredients: input.ingredients || null,
    allergens: input.allergens,
    storage_instructions: input.storageInstructions || null,
    preparation_instructions: input.preparationInstructions || null,
    option_groups: input.optionGroups ?? [],
    cake_layers: input.cakeLayers ?? {},
    updated_at: new Date().toISOString(),
  };
}

// Product fields, pack rows and audit records are committed by one database RPC.
export function productSaveArguments(input: ProductInput, categoryId: string) {
  return {
    p_product: productRow(input, categoryId),
    p_variants: input.variants.map((variant, index) => ({ ...variant, sortOrder: index })),
    p_images: input.images,
  };
}

export function productSaveError(error: { code?: string; message?: string }) {
  const message = error.message ?? "";
  if (error.code === "23505" || message.includes("DUPLICATE"))
    return { status: 409, error: "That product link or published pack size is already in use." };
  if (message.includes("INVENTORY_CHANGED"))
    return { status: 409, error: "Stock changed while you were editing. Reload the product before saving." };
  if (message.includes("STOCK_BELOW_RESERVED") || message.includes("reserved"))
    return { status: 409, error: "This stock is reserved for pending orders. Keep enough packs to fulfil them." };
  if (message.includes("OWNERSHIP"))
    return {
      status: 400,
      error: "An option or image does not belong to this product, or the option was retired. Reload and try again.",
    };
  if (message.includes("PACK") || message.includes("PRICE"))
    return { status: 400, error: "Published packs need unique sizes and positive selling prices." };
  if (message.includes("PRODUCT_NOT_FOUND")) return { status: 404, error: "Product could not be found." };
  return { status: 500, error: "Product could not be saved. Please try again or contact support." };
}

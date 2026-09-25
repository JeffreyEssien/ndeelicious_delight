import type { ProductInput } from "@/validations/product";

export function productRow(input: ProductInput, categoryId: string) {
  return {
    category_id: categoryId,
    name: input.name,
    slug: input.slug,
    short_description: input.shortDescription,
    description: input.description,
    base_price: input.price,
    discount_price: input.discountPrice,
    sku: input.sku || null,
    status: input.status,
    featured: input.featured,
    track_inventory: input.trackInventory,
    stock_quantity: input.stockQuantity,
    low_stock_threshold: input.lowStockThreshold,
    ingredients: input.ingredients || null,
    allergens: input.allergens,
    storage_instructions: input.storageInstructions || null,
    preparation_instructions: input.preparationInstructions || null,
    updated_at: new Date().toISOString(),
  };
}

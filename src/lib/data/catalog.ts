import type { Product, ProductImage, ProductVariant } from "@/types";
import { products as fallbackProducts, deliveryZones as fallbackZones } from "@/lib/mock-data";
import { createClient } from "@/lib/supabase/server";

type ProductRow = {
  id: string; slug: string; name: string; short_description: string; description: string; sku: string | null;
  base_price: number; discount_price: number | null; status: Product["status"];
  featured: boolean; track_inventory: boolean; stock_quantity: number; low_stock_threshold: number; ingredients: string | null;
  allergens: string[]; storage_instructions: string | null; preparation_instructions: string | null;
  categories: { slug: string } | { slug: string }[] | null;
  product_variants: { id: string; name: string; sku: string | null; price_adjustment: number; stock_quantity: number; active: boolean }[];
  product_images: { id: string; url: string; alt_text: string; sort_order: number; storage_path: string | null }[];
};

const categoryMap: Record<string, Product["category"]> = {
  "custom-cakes": "CUSTOM_CAKES", pastries: "PASTRIES", "ready-to-bake": "READY_TO_BAKE",
};

function mapProduct(row: ProductRow, includeInactiveVariants = false): Product {
  const relation = Array.isArray(row.categories) ? row.categories[0] : row.categories;
  const images: ProductImage[] = [...row.product_images]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((image) => ({
      id: image.id,
      url: image.url,
      altText: image.alt_text,
      sortOrder: image.sort_order,
      storagePath: image.storage_path ?? undefined,
    }));
  const variants: ProductVariant[] = row.product_variants
    .filter((variant) => includeInactiveVariants || variant.active)
    .map((variant) => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku ?? undefined,
      priceAdjustment: variant.price_adjustment,
      stockQuantity: variant.stock_quantity,
      active: variant.active,
    }));
  return {
    id: row.id, slug: row.slug, name: row.name, shortDescription: row.short_description,
    description: row.description, category: categoryMap[relation?.slug ?? ""] ?? "PASTRIES",
    price: row.base_price, discountPrice: row.discount_price ?? undefined, sku: row.sku ?? undefined,
    image: images[0]?.url || "/pastries.jpg", images, featured: row.featured, status: row.status,
    trackInventory: row.track_inventory,
    stockQuantity: row.stock_quantity, lowStockThreshold: row.low_stock_threshold,
    variants,
    ingredients: row.ingredients ?? "", allergens: row.allergens ?? [],
    storageInstructions: row.storage_instructions ?? undefined,
    preparationInstructions: row.preparation_instructions ?? undefined,
  };
}

export async function getProducts(options: { includeInactive?: boolean; fallback?: boolean } = {}) {
  try {
    const supabase = await createClient();
    let query = supabase.from("products").select(`
      id,slug,name,short_description,description,sku,base_price,discount_price,status,featured,
      track_inventory,stock_quantity,low_stock_threshold,ingredients,allergens,storage_instructions,preparation_instructions,
      categories(slug),product_variants(id,name,sku,price_adjustment,stock_quantity,active),
      product_images(id,url,alt_text,sort_order,storage_path)
    `).order("created_at", { ascending: false });
    if (!options.includeInactive) query = query.in("status", ["ACTIVE", "OUT_OF_STOCK"]);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) return [];
    return (data as unknown as ProductRow[]).map((row) => mapProduct(row, options.includeInactive));
  } catch {
    return options.fallback === false ? [] : fallbackProducts;
  }
}

export async function getProduct(slug: string) {
  return (await getProducts()).find((product) => product.slug === slug);
}

export async function getDeliveryZones() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("delivery_zones")
      .select("id,name,fee,estimated_time,active").eq("active", true).order("sort_order");
    if (error) throw error;
    if (!data?.length) return fallbackZones;
    return data.map((zone) => ({ id: zone.id, name: zone.name, fee: zone.fee,
      estimate: zone.estimated_time ?? "Delivery time confirmed after ordering", active: zone.active }));
  } catch { return fallbackZones; }
}

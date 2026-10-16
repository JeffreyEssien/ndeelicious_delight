import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { isVariantInventoryTracked } from "@/features/catalog/availability";
import type { CakeOptionGroup, Collection, Product, ProductImage, ProductVariant } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  short_description: string;
  description: string;
  sku: string | null;
  shopping_mode: Product["shoppingMode"];
  preparation_hours: number;
  tax_class: Product["taxClass"];
  base_price: number;
  discount_price: number | null;
  status: Product["status"];
  featured: boolean;
  collection_id: string | null;
  track_inventory: boolean;
  stock_quantity: number;
  low_stock_threshold: number;
  ingredients: string | null;
  allergens: string[];
  storage_instructions: string | null;
  preparation_instructions: string | null;
  option_groups: CakeOptionGroup[] | null;
  cake_layers: Record<string, number> | null;
  categories: { id: string; slug: string } | { id: string; slug: string }[] | null;
  product_variants: {
    id: string;
    name: string;
    sku: string | null;
    price_adjustment: number;
    pack_quantity: number | null;
    retired_at: string | null;
    sort_order: number;
    track_inventory: boolean | null;
    stock_quantity: number;
    active: boolean;
  }[];
  product_images: { id: string; url: string; alt_text: string; sort_order: number; storage_path: string | null }[];
};

const categoryMap: Record<string, Product["category"]> = {
  "custom-cakes": "CUSTOM_CAKES",
  pastries: "PASTRIES",
  "ready-to-bake": "READY_TO_BAKE",
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
    .filter((variant) => !variant.retired_at && (includeInactiveVariants || variant.active))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id.localeCompare(b.id))
    .map((variant) => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku ?? undefined,
      priceAdjustment: variant.price_adjustment,
      packQuantity: variant.pack_quantity ?? null,
      sortOrder: variant.sort_order ?? 0,
      trackInventory: variant.track_inventory ?? null,
      stockQuantity: variant.stock_quantity,
      active: variant.active,
    }));
  return {
    id: row.id,
    categoryId: relation?.id,
    shoppingMode: row.shopping_mode,
    preparationHours: row.preparation_hours,
    taxClass: row.tax_class ?? "REQUIRES_REVIEW",
    slug: row.slug,
    name: row.name,
    shortDescription: row.short_description,
    description: row.description,
    category: categoryMap[relation?.slug ?? ""] ?? "PASTRIES",
    collectionId: row.collection_id ?? undefined,
    price: row.base_price,
    discountPrice: row.discount_price ?? undefined,
    sku: row.sku ?? undefined,
    image: images[0]?.url ?? "",
    images,
    featured: row.featured,
    status: row.status,
    trackInventory: row.track_inventory,
    stockQuantity: row.stock_quantity,
    lowStockThreshold: row.low_stock_threshold,
    variants,
    ingredients: row.ingredients ?? "",
    allergens: row.allergens ?? [],
    storageInstructions: row.storage_instructions ?? undefined,
    preparationInstructions: row.preparation_instructions ?? undefined,
    optionGroups: Array.isArray(row.option_groups) ? row.option_groups : [],
    cakeLayers: row.cake_layers && typeof row.cake_layers === "object" ? row.cake_layers : {},
  };
}

async function loadProducts(options: { includeInactive?: boolean; client?: SupabaseClient; ids?: string[] } = {}) {
  const supabase = options.client ?? (await createClient());
  let query = supabase
    .from("products")
    .select(`
      id,slug,name,short_description,description,sku,shopping_mode,preparation_hours,tax_class,base_price,discount_price,status,featured,collection_id,
      track_inventory,stock_quantity,low_stock_threshold,ingredients,allergens,storage_instructions,preparation_instructions,option_groups,cake_layers,
      categories(id,slug),product_variants(id,name,sku,price_adjustment,pack_quantity,sort_order,track_inventory,retired_at,stock_quantity,active),
      product_images(id,url,alt_text,sort_order,storage_path)
    `)
    .order("created_at", { ascending: false });
  if (!options.includeInactive) query = query.in("status", ["ACTIVE", "OUT_OF_STOCK"]);
  if (options.ids) {
    if (!options.ids.length) return [];
    query = query.in("id", options.ids);
  }
  const { data, error } = await query;
  if (error) throw error;
  const products =
    (data as unknown as ProductRow[] | null)?.map((row) => mapProduct(row, options.includeInactive)) ?? [];
  if (options.includeInactive || !products.length) return products;
  const { data: available, error: availabilityError } = await supabase.rpc("product_pack_availability", {
    p_ids: products.map((product) => product.id),
  });
  if (availabilityError) throw availabilityError;
  if (!available || typeof available !== "object" || Array.isArray(available))
    throw new Error("Pack availability could not be verified.");
  return products.map((product) => ({
    ...product,
    variants: product.variants.map((variant) => ({
      ...variant,
      stockQuantity: isVariantInventoryTracked(product, variant)
        ? Number(available[variant.id] ?? 0)
        : variant.stockQuantity,
    })),
  }));
}

const getCachedProducts = unstable_cache(
  () => loadProducts({ client: createServiceClient() }),
  ["storefront-products"],
  {
    tags: ["storefront"],
    revalidate: 300,
  },
);

export function getProducts(options: { includeInactive?: boolean; client?: SupabaseClient; ids?: string[] } = {}) {
  return options.client || options.includeInactive ? loadProducts(options) : getCachedProducts();
}

export async function getProduct(slug: string) {
  return (await getProducts()).find((product) => product.slug === slug);
}

export async function getCollections(client?: SupabaseClient): Promise<Collection[]> {
  const supabase = client ?? (await createClient());
  const { data } = await supabase
    .from("collections")
    .select("id,parent,name,slug,sort_order")
    .eq("active", true)
    .order("parent")
    .order("sort_order");
  return (data ?? []).map((row) => ({
    id: row.id,
    parent: row.parent as Collection["parent"],
    name: row.name,
    slug: row.slug,
    sortOrder: row.sort_order,
  }));
}

async function loadDeliveryZones(client?: SupabaseClient, includeInactive = false) {
  const supabase = client ?? (await createClient());
  let query = supabase
    .from("delivery_zones")
    .select(
      "id,name,fee,minimum_order,estimated_time,active,postal_code_prefixes,free_delivery_threshold,customer_note,same_day_eligible,sort_order",
    )
    .order("sort_order");
  if (!includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((zone) => ({
    id: zone.id,
    name: zone.name,
    fee: zone.fee,
    minimumOrder: zone.minimum_order,
    estimate: zone.estimated_time ?? "Awaiting a delivery estimate",
    active: zone.active,
    postalCodePrefixes: (zone.postal_code_prefixes ?? []) as string[],
    freeDeliveryThreshold: zone.free_delivery_threshold as number | null,
    customerNote: String(zone.customer_note ?? ""),
    sameDayEligible: Boolean(zone.same_day_eligible),
    sortOrder: Number(zone.sort_order ?? 0),
  }));
}

const getCachedDeliveryZones = unstable_cache(
  () => loadDeliveryZones(createServiceClient()),
  ["storefront-delivery-zones"],
  { tags: ["storefront"], revalidate: 300 },
);

export function getDeliveryZones(client?: SupabaseClient, includeInactive = false) {
  return client || includeInactive ? loadDeliveryZones(client, includeInactive) : getCachedDeliveryZones();
}

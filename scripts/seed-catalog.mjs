import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { products, deliveryZones, cakeOptions } from "./catalog-seed-data.mjs";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase URL and service-role key are required.");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const categorySlug = { CUSTOM_CAKES: "custom-cakes", PASTRIES: "pastries", READY_TO_BAKE: "ready-to-bake" };
const { data: categories, error: categoryError } = await db.from("categories").select("id,slug");
if (categoryError) throw categoryError;

for (const product of products) {
  const category = categories.find((item) => item.slug === categorySlug[product.category]);
  if (!category) throw new Error(`Missing category for ${product.name}`);
  const { data: row, error } = await db
    .from("products")
    .upsert(
      {
        category_id: category.id,
        name: product.name,
        slug: product.slug,
        short_description: product.shortDescription,
        description: product.description,
        base_price: product.price,
        discount_price: product.discountPrice ?? null,
        status: product.status,
        featured: product.featured ?? false,
        stock_quantity: product.stockQuantity,
        low_stock_threshold: product.lowStockThreshold,
        ingredients: product.ingredients,
        allergens: product.allergens,
        storage_instructions: product.storageInstructions ?? null,
        preparation_instructions: product.preparationInstructions ?? null,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();
  if (error) throw error;
  const { count } = await db
    .from("product_variants")
    .select("id", { count: "exact", head: true })
    .eq("product_id", row.id);
  if (!count) {
    const { error: variantError } = await db.from("product_variants").insert(
      product.variants.map((variant) => ({
        product_id: row.id,
        name: variant.name,
        price_adjustment: variant.priceAdjustment,
        stock_quantity: variant.stockQuantity,
        active: true,
      })),
    );
    if (variantError) throw variantError;
  }
  const { count: imageCount } = await db
    .from("product_images")
    .select("id", { count: "exact", head: true })
    .eq("product_id", row.id);
  if (!imageCount) {
    const { error: imageError } = await db
      .from("product_images")
      .insert({ product_id: row.id, url: product.image, alt_text: product.name, sort_order: 0 });
    if (imageError) throw imageError;
  }
}

for (const [index, zone] of deliveryZones.entries()) {
  const { error } = await db.from("delivery_zones").upsert(
    {
      name: zone.name,
      fee: zone.fee,
      minimum_order: zone.minimumOrder,
      estimated_time: zone.estimate,
      active: zone.active,
      sort_order: index + 1,
    },
    { onConflict: "name" },
  );
  if (error) throw error;
}

const optionRows = [
  ...cakeOptions.sizes.map((item, index) => ({
    type: "size",
    name: item.name,
    description: item.detail,
    price_adjustment: item.price,
    sort_order: index,
  })),
  ...cakeOptions.flavours.map((item, index) => ({
    type: "flavour",
    name: item.name,
    price_adjustment: item.price,
    sort_order: index,
  })),
  ...cakeOptions.fillings.map((item, index) => ({
    type: "filling",
    name: item.name,
    price_adjustment: item.price,
    sort_order: index,
  })),
  ...cakeOptions.designs.map((item, index) => ({
    type: "design",
    name: item.name,
    price_adjustment: item.price,
    quote_required: item.name === "Floral garden",
    sort_order: index,
  })),
];
for (const option of optionRows) {
  const { data } = await db
    .from("custom_cake_options")
    .select("id")
    .eq("type", option.type)
    .eq("name", option.name)
    .maybeSingle();
  if (!data) {
    const { error } = await db.from("custom_cake_options").insert(option);
    if (error) throw error;
  }
}
await db.from("coupons").upsert(
  {
    code: "SWEET10",
    type: "PERCENTAGE",
    value: 10,
    minimum_order: 1000000,
    maximum_discount: 500000,
    usage_limit: 100,
    active: true,
  },
  { onConflict: "code" },
);
await db.from("site_settings").upsert({ key: "theme", value: "berry" }, { onConflict: "key" });
console.log(
  `Seeded ${products.length} products, ${deliveryZones.length} delivery zones, and ${optionRows.length} cake options.`,
);

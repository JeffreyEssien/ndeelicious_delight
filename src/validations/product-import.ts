import { z } from "zod";
import { taxClasses } from "@/features/tax/types";
import { MIN_LEAD_TIME_HOURS, productCategorySchema, productStatusSchema } from "@/validations/product";

const text = (maximum: number) => z.string().trim().max(maximum).optional().default("");
const list = z.array(z.string().trim().min(1).max(100)).max(50).optional().default([]);
// Form answers arrive in dollars; the catalogue stores cents.
const dollars = z.number().min(0).max(10_000_000);

// A flatter, form-friendly shape for the Google Form import. It is converted to the
// regular product input and then validated by productInputSchema like any admin save.
export const productImportSchema = z.object({
  name: z.string().trim().min(2).max(150),
  slug: z.string().trim().max(180).optional().default(""),
  category: productCategorySchema,
  collection: text(100),
  shortDescription: text(500),
  description: text(10_000),
  price: dollars,
  salePrice: dollars.nullable().optional().default(null),
  status: productStatusSchema.default("DRAFT"),
  featured: z.boolean().default(false),
  taxClass: z.enum(taxClasses).default("REQUIRES_REVIEW"),
  preparationHours: z.number().min(MIN_LEAD_TIME_HOURS).max(8760).default(MIN_LEAD_TIME_HOURS),
  trackInventory: z.boolean().default(false),
  lowStockThreshold: z.number().int().min(0).max(1_000_000).default(0),
  ingredients: text(5_000),
  allergens: list,
  storageInstructions: text(2_000),
  preparationInstructions: text(2_000),
  flavours: list,
  fillings: list,
  variants: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        price: dollars.nullable().optional(),
        stock: z.number().int().min(0).max(1_000_000).nullable().optional(),
        packQuantity: z.number().int().positive().nullable().optional(),
      }),
    )
    .max(100)
    .optional()
    .default([]),
});

export type ProductImport = z.infer<typeof productImportSchema>;

const cents = (value: number) => Math.round(value * 100);

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Mirrors the admin editor: ready-to-bake items keep their own mode, everything else is sold in packs/sizes.
export function toProductInput(data: ProductImport, slug: string, collectionId: string | null) {
  const shoppingMode = data.category === "READY_TO_BAKE" ? "READY_TO_BAKE" : "MADE_TO_ORDER";
  const price = cents(data.price);
  const discountPrice = data.salePrice === null ? null : cents(data.salePrice);
  const base = discountPrice ?? price;
  const variants = data.variants.length
    ? data.variants
    : [
        {
          name: data.category === "CUSTOM_CAKES" ? "Standard" : "Single",
          price: null,
          stock: null,
          packQuantity: null,
        },
      ];
  return {
    name: data.name,
    slug,
    shortDescription: data.shortDescription,
    description: data.description,
    category: data.category,
    shoppingMode,
    taxClass: data.taxClass,
    preparationHours: data.preparationHours,
    price,
    discountPrice,
    status: data.status,
    featured: data.featured,
    trackInventory: data.trackInventory,
    lowStockThreshold: data.lowStockThreshold,
    ingredients: data.ingredients,
    allergens: data.allergens,
    storageInstructions: data.storageInstructions,
    preparationInstructions: data.preparationInstructions,
    variants: variants.map((variant, index) => ({
      name: variant.name,
      sortOrder: index,
      trackInventory: null,
      packQuantity: variant.packQuantity ?? (shoppingMode === "MADE_TO_ORDER" ? 1 : null),
      priceAdjustment: (variant.price == null ? base : cents(variant.price)) - base,
      stockQuantity: variant.stock ?? 0,
      active: true,
    })),
    optionGroups:
      data.category === "CUSTOM_CAKES"
        ? [
            { id: "flavour", name: "Flavour", required: true, choices: data.flavours },
            { id: "filling", name: "Filling", required: true, choices: data.fillings },
          ].filter((group) => group.choices.length)
        : [],
    images: [],
    collectionId,
  };
}

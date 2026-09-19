import { z } from "zod";

export const productCategorySchema = z.enum(["CUSTOM_CAKES", "PASTRIES", "READY_TO_BAKE"]);
export const productStatusSchema = z.enum(["ACTIVE", "OUT_OF_STOCK", "DRAFT", "ARCHIVED"]);

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional().default("");

export const productVariantInputSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Each variant needs a name.").max(100),
  sku: optionalText(100),
  priceAdjustment: z.number().int().min(-100_000_000).max(100_000_000),
  stockQuantity: z.number().int().min(0).max(1_000_000),
  active: z.boolean().default(true),
});

export const productImageInputSchema = z.object({
  id: z.uuid(),
  altText: z.string().trim().min(1, "Each image needs alternative text.").max(250),
  sortOrder: z.number().int().min(0).max(20),
});

export const productInputSchema = z
  .object({
    name: z.string().trim().min(2).max(150),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(180)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase URL slug with hyphens."),
    shortDescription: z.string().trim().min(2).max(500),
    description: z.string().trim().min(2).max(10_000),
    category: productCategorySchema,
    price: z.number().int().min(0).max(1_000_000_000),
    discountPrice: z.number().int().min(0).max(1_000_000_000).nullable(),
    sku: optionalText(100),
    status: productStatusSchema,
    featured: z.boolean(),
    trackInventory: z.boolean(),
    stockQuantity: z.number().int().min(0).max(1_000_000),
    lowStockThreshold: z.number().int().min(0).max(1_000_000),
    ingredients: optionalText(5_000),
    allergens: z.array(z.string().trim().min(1).max(100)).max(30),
    storageInstructions: optionalText(2_000),
    preparationInstructions: optionalText(2_000),
    variants: z.array(productVariantInputSchema).min(1, "Add at least one variant.").max(50),
    images: z.array(productImageInputSchema).max(12),
  })
  .superRefine((product, context) => {
    if (product.discountPrice !== null && product.discountPrice > product.price) {
      context.addIssue({
        code: "custom",
        path: ["discountPrice"],
        message: "Sale price cannot exceed the regular price.",
      });
    }
    if (product.status === "ACTIVE" && !product.variants.some((variant) => variant.active)) {
      context.addIssue({ code: "custom", path: ["variants"], message: "An active product needs an active variant." });
    }
  });

export type ProductInput = z.infer<typeof productInputSchema>;

export function categorySlug(category: z.infer<typeof productCategorySchema>) {
  return {
    CUSTOM_CAKES: "custom-cakes",
    PASTRIES: "pastries",
    READY_TO_BAKE: "ready-to-bake",
  }[category];
}

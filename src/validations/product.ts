import { z } from "zod";
import { taxClasses } from "@/features/tax/types";

export const productCategorySchema = z.enum(["CUSTOM_CAKES", "PASTRIES", "READY_TO_BAKE"]);
export const productStatusSchema = z.enum(["ACTIVE", "OUT_OF_STOCK", "DRAFT", "ARCHIVED"]);

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional().default("");

export const productVariantInputSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Each variant needs a name.").max(100),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  trackInventory: z.boolean().nullable().default(null),
  expectedStockQuantity: z.number().int().min(0).optional(),
  packQuantity: z.number().int().positive().max(2_147_483_647).nullable().default(null),
  priceAdjustment: z.number().int().min(-1_000_000_000).max(1_000_000_000),
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
    shoppingMode: z.enum(["READY_TO_ORDER", "MADE_TO_ORDER", "READY_TO_BAKE"]).default("READY_TO_ORDER"),
    taxClass: z.enum(taxClasses).default("REQUIRES_REVIEW"),
    preparationHours: z
      .number()
      .min(0)
      .max(8760)
      .refine((hours) => Math.abs(hours * 60 - Math.round(hours * 60)) < 0.000001, "Use whole minutes.")
      .default(0),
    price: z.number().int().min(0).max(1_000_000_000),
    discountPrice: z.number().int().min(0).max(1_000_000_000).nullable(),
    status: productStatusSchema,
    featured: z.boolean(),
    trackInventory: z.boolean(),
    lowStockThreshold: z.number().int().min(0).max(1_000_000),
    ingredients: optionalText(5_000),
    allergens: z.array(z.string().trim().min(1).max(100)).max(30),
    storageInstructions: optionalText(2_000),
    preparationInstructions: optionalText(2_000),
    variants: z.array(productVariantInputSchema).max(100),
    images: z.array(productImageInputSchema).max(12),
  })
  .superRefine((product, context) => {
    const base = product.discountPrice ?? product.price;
    if (product.shoppingMode !== "MADE_TO_ORDER" && !product.variants.length)
      context.addIssue({ code: "custom", path: ["variants"], message: "Add at least one variant." });
    const ids = product.variants.flatMap((v) => (v.id ? [v.id] : []));
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: "custom",
        path: ["variants"],
        message: "An option was included more than once. Reload before saving.",
      });
    const sizes = new Set<number>();
    if (product.shoppingMode === "MADE_TO_ORDER")
      product.variants.forEach((variant, index) => {
        if (!variant.active) return;
        if (!variant.packQuantity || base + variant.priceAdjustment <= 0)
          context.addIssue({
            code: "custom",
            path: ["variants", index],
            message:
              "Published packs need a positive whole-number size and selling price. Mark incomplete legacy options unavailable until completed.",
          });
        if (variant.packQuantity && sizes.has(variant.packQuantity))
          context.addIssue({
            code: "custom",
            path: ["variants", index, "packQuantity"],
            message: "Each published pack must have a different size.",
          });
        if (variant.packQuantity) sizes.add(variant.packQuantity);
      });
    if (product.variants.some((variant) => (product.discountPrice ?? product.price) + variant.priceAdjustment < 0)) {
      context.addIssue({
        code: "custom",
        path: ["variants"],
        message: "Variants must have a nonnegative final price.",
      });
    }
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

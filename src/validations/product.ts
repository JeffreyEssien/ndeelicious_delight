import { z } from "zod";
import { taxClasses } from "@/features/tax/types";

export const productCategorySchema = z.enum(["CUSTOM_CAKES", "PASTRIES", "READY_TO_BAKE"]);
export const productStatusSchema = z.enum(["ACTIVE", "OUT_OF_STOCK", "DRAFT", "ARCHIVED"]);

// Every order needs at least a day's notice, whatever is in it.
export const MIN_LEAD_TIME_HOURS = 24;

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional().default("");

export const productVariantInputSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Each variant needs a name.").max(100),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  trackInventory: z.boolean().nullable().default(null),
  expectedStockQuantity: z.number().int().min(0).optional(),
  packQuantity: z.number().int().positive().max(2_147_483_647).nullable().default(null),
  priceAdjustment: z.number().int().min(-1_000_000_000).max(1_000_000_000),
  stockQuantity: z
    .number({ error: "Enter stock as a whole number." })
    .int("Enter stock as a whole number.")
    .min(0, "Stock cannot be negative.")
    .max(1_000_000),
  active: z.boolean().default(true),
});

export const productOptionGroupInputSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1, "Each option group needs a name.").max(100),
  choices: z.array(z.string().trim().min(1).max(100)).min(1, "Add at least one choice.").max(50),
  required: z.boolean().default(true),
});

export const productImageInputSchema = z.object({
  id: z.uuid(),
  altText: z.string().trim().min(1, "Each image needs alternative text.").max(250),
  sortOrder: z.number().int().min(0).max(20),
});

export const productInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Give the product a name of at least 2 characters.")
      .max(150, "Keep the product name under 150 characters."),
    slug: z
      .string()
      .trim()
      .min(2, "The product link needs at least 2 letters or numbers. Change the name or the link.")
      .max(180, "The product link is too long. Shorten it.")
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase URL slug with hyphens."),
    // Descriptions are optional for cakes; the superRefine below enforces them for other categories.
    shortDescription: z.string().trim().max(500, "Keep the short description under 500 characters."),
    description: z.string().trim().max(10_000, "Keep the full description under 10,000 characters."),
    category: productCategorySchema,
    shoppingMode: z.enum(["READY_TO_ORDER", "MADE_TO_ORDER", "READY_TO_BAKE"]).default("READY_TO_ORDER"),
    taxClass: z.enum(taxClasses).default("REQUIRES_REVIEW"),
    preparationHours: z
      .number({ error: "Enter the lead time in hours." })
      .min(MIN_LEAD_TIME_HOURS, `Lead time must be at least ${MIN_LEAD_TIME_HOURS} hours.`)
      .max(8760, "Lead time must be under a year.")
      .refine((hours) => Math.abs(hours * 60 - Math.round(hours * 60)) < 0.000001, "Use whole minutes.")
      .default(MIN_LEAD_TIME_HOURS),
    price: z
      .number({ error: "Enter a price, for example 24.50." })
      .int()
      .min(0, "The price cannot be negative.")
      .max(1_000_000_000),
    discountPrice: z
      .number({ error: "Enter a sale price, for example 19.99, or leave it empty." })
      .int()
      .min(0, "The sale price cannot be negative.")
      .max(1_000_000_000)
      .nullable(),
    status: productStatusSchema,
    featured: z.boolean(),
    trackInventory: z.boolean(),
    lowStockThreshold: z
      .number({ error: "Enter the low stock alert as a whole number." })
      .int("Enter the low stock alert as a whole number.")
      .min(0, "The low stock alert cannot be negative.")
      .max(1_000_000),
    ingredients: optionalText(5_000),
    allergens: z.array(z.string().trim().min(1).max(100)).max(30),
    storageInstructions: optionalText(2_000),
    preparationInstructions: optionalText(2_000),
    variants: z.array(productVariantInputSchema).max(100),
    optionGroups: z.array(productOptionGroupInputSchema).max(20).default([]),
    cakeLayers: z
      .record(
        z.string(),
        z.array(z.object({ layers: z.number().int().min(1).max(6), priceAdjustment: z.number().int() })).max(6),
      )
      .default({}),
    images: z.array(productImageInputSchema).max(12),
    collectionId: z.union([z.uuid(), z.literal(""), z.null()]).optional(),
  })
  .superRefine((product, context) => {
    const base = product.discountPrice ?? product.price;
    // Hidden products (drafts, archived) may be saved half-finished so work is never lost; the rules
    // below that only matter to customers apply once the product is visible.
    const visible = isVisibleStatus(product.status);
    // Non-cake products still need both descriptions; cakes may leave them blank.
    if (visible && product.category !== "CUSTOM_CAKES") {
      if (product.shortDescription.length < 2)
        context.addIssue({ code: "custom", path: ["shortDescription"], message: "Add a short description." });
      if (product.description.length < 2)
        context.addIssue({ code: "custom", path: ["description"], message: "Add a full description." });
    }
    if (visible && product.shoppingMode !== "MADE_TO_ORDER" && !product.variants.length)
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
      context.addIssue({
        code: "custom",
        path: ["variants"],
        message: "Publish at least one pack or size (with a name and price) before making the product visible.",
      });
    }
  });

export type ProductInput = z.infer<typeof productInputSchema>;

export const isVisibleStatus = (status: z.infer<typeof productStatusSchema>) =>
  status === "ACTIVE" || status === "OUT_OF_STOCK";

const FIELD_LABELS: Record<string, string> = {
  name: "Product name",
  slug: "Product link",
  shortDescription: "Short description",
  description: "Full description",
  ingredients: "Ingredients",
  allergens: "Allergens",
  storageInstructions: "Storage instructions",
  preparationInstructions: "Preparation instructions",
  lowStockThreshold: "Low-stock alert",
  preparationHours: "Lead time",
  optionGroups: "Flavours and fillings",
  cakeLayers: "Cake layers",
  images: "Photos",
  price: "Price",
};

// Zod's own wording ("Too big: expected string to have <=500 characters") means nothing to a shop owner.
function friendlyIssue(issue: z.core.$ZodIssue) {
  if (!/^(too (big|small)|invalid|expected)/i.test(issue.message)) return issue.message;
  const [field, index] = issue.path;
  const label =
    field === "variants" && typeof index === "number"
      ? `Pack or size ${index + 1}`
      : (FIELD_LABELS[String(field)] ?? "A field");
  if (issue.code === "too_big") return `${label} is too long. Shorten it.`;
  if (issue.code === "too_small") return `${label} is empty or too short.`;
  return `${label} has a value that could not be read. Check it and try again.`;
}

// Every problem with a product, in words the owner can act on, so she can fix them all in one go.
export function productIssues(error: z.ZodError) {
  return [...new Set(error.issues.map(friendlyIssue))];
}

export function categorySlug(category: z.infer<typeof productCategorySchema>) {
  return {
    CUSTOM_CAKES: "custom-cakes",
    PASTRIES: "pastries",
    READY_TO_BAKE: "ready-to-bake",
  }[category];
}

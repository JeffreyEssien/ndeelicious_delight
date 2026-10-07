import type { Product, ProductVariant } from "@/types";
import { getPurchasableVariants } from "./availability";
export function variantPrice(product: Product, variant: ProductVariant) {
  return (product.discountPrice ?? product.price) + variant.priceAdjustment;
}
export function productStartingPrice(product: Product) {
  const variants = getPurchasableVariants(product);
  return variants.length
    ? Math.min(...variants.map((variant) => variantPrice(product, variant)))
    : (product.discountPrice ?? product.price);
}
export function shoppingMode(product: Product) {
  return product.shoppingMode ?? (product.category === "READY_TO_BAKE" ? "READY_TO_BAKE" : "READY_TO_ORDER");
}
export function preparationLabel(product: Product) {
  return product.preparationHours ? `Preparation: ${product.preparationHours} hours` : "Available to order";
}

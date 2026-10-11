import type { Product, ProductVariant } from "@/types";
import { getPurchasableVariants, getPublishedVariants } from "./availability";
export function variantPrice(product: Product, variant: ProductVariant) {
  return (product.discountPrice ?? product.price) + variant.priceAdjustment;
}
export function productStartingPrice(product: Product) {
  const available = getPurchasableVariants(product);
  const variants = available.length ? available : getPublishedVariants(product);
  return variants.length
    ? Math.min(...variants.map((variant) => variantPrice(product, variant)))
    : (product.discountPrice ?? product.price);
}
export function shoppingMode(product: Product) {
  return product.shoppingMode ?? (product.category === "READY_TO_BAKE" ? "READY_TO_BAKE" : "READY_TO_ORDER");
}
export function preparationLabel(product: Product) {
  if (!product.preparationHours) return "Available to order";
  return `Preparation: ${formatPreparationTime(product.preparationHours)}`;
}

export function formatPreparationTime(hours: number) {
  const minutes = Math.round(hours * 60);
  const wholeHours = Math.floor(minutes / 60),
    remaining = minutes % 60;
  if (!wholeHours) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  return `${wholeHours} ${wholeHours === 1 ? "hour" : "hours"}${remaining ? ` ${remaining} min` : ""}`;
}

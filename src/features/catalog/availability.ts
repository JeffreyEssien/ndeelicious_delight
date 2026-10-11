import type { Product, ProductVariant } from "@/types";
import { variantPrice } from "./pricing";

export function isVariantInventoryTracked(product: Product, variant: ProductVariant) {
  return variant.trackInventory ?? product.trackInventory ?? true;
}

export function getPublishedVariants(product: Product): ProductVariant[] {
  return product.variants
    .filter(
      (variant) =>
        variant.active !== false &&
        !variant.retiredAt &&
        (product.shoppingMode !== "MADE_TO_ORDER" ||
          (Number.isInteger(variant.packQuantity) &&
            (variant.packQuantity ?? 0) > 0 &&
            variantPrice(product, variant) > 0)),
    )
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export function getPurchasableVariants(product: Product): ProductVariant[] {
  if (product.status !== "ACTIVE") return [];
  return getPublishedVariants(product).filter(
    (variant) => !isVariantInventoryTracked(product, variant) || variant.stockQuantity > 0,
  );
}

export function isProductPurchasable(product: Product) {
  return getPurchasableVariants(product).length > 0;
}
export function getDefaultPurchasableVariant(product: Product) {
  return getPurchasableVariants(product)[0];
}
export function isVariantPurchasable(product: Product, variant: ProductVariant) {
  return getPurchasableVariants(product).some((item) => item.id === variant.id);
}
export function variantQuantityLimit(product: Product, variant: ProductVariant) {
  return isVariantPurchasable(product, variant)
    ? Math.min(50, isVariantInventoryTracked(product, variant) ? variant.stockQuantity : 50)
    : 0;
}

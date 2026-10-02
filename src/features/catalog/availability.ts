import type { Product, ProductVariant } from "@/types";

export function getPurchasableVariants(product: Product): ProductVariant[] {
  if (product.status !== "ACTIVE") return [];
  return product.variants.filter(
    (variant) => variant.active !== false && (product.trackInventory === false || variant.stockQuantity > 0),
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

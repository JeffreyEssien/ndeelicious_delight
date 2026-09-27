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
  const variants = getPurchasableVariants(product);
  return variants.length === 1 ? variants[0] : undefined;
}

import type { CartLine, Product } from "@/types";
import { CommerceError } from "@/features/checkout/pricing";

export function deductInventory(products: Product[], cart: CartLine[]): Product[] {
  const next = structuredClone(products);
  for (const line of cart) {
    const product = next.find((p) => p.id === line.productId);
    const variant = product?.variants.find((v) => v.id === line.variantId);
    if (!product || !variant) throw new CommerceError("PRODUCT_UNAVAILABLE", "A product is no longer available.");
    if (product.trackInventory === false) continue;
    if (product.stockQuantity < line.quantity || variant.stockQuantity < line.quantity)
      throw new CommerceError(
        "INSUFFICIENT_STOCK",
        `Only ${Math.min(product.stockQuantity, variant.stockQuantity)} of ${product.name} remain.`,
      );
    product.stockQuantity -= line.quantity;
    variant.stockQuantity -= line.quantity;
    if (product.stockQuantity === 0 || product.variants.every((v) => v.stockQuantity === 0))
      product.status = "OUT_OF_STOCK";
  }
  return next;
}

export class IdempotencyLedger<T> {
  private results = new Map<string, T>();
  run(key: string, operation: () => T): T {
    const cached = this.results.get(key);
    if (cached !== undefined) return cached;
    const result = operation();
    this.results.set(key, result);
    return result;
  }
}

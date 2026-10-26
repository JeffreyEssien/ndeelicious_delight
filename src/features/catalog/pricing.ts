import type { CakeSizeLayer, CartSelection, Product, ProductVariant } from "@/types";
import { getPurchasableVariants, getPublishedVariants } from "./availability";

// Customer-facing names for the three product groups.
const categoryNames: Record<string, string> = {
  PASTRIES: "Ready to order",
  READY_TO_BAKE: "Ready to bake",
  CUSTOM_CAKES: "Custom cakes",
};
export function categoryLabel(category: string) {
  return categoryNames[category] ?? category.replaceAll("_", " ");
}
export function variantPrice(product: Product, variant: ProductVariant) {
  return (product.discountPrice ?? product.price) + variant.priceAdjustment;
}

// Accepts the stored cake-layers shape in any of its historical forms — a single number,
// a list of numbers, or the current list of { layers, priceAdjustment } — and returns the
// normalised list, deduped by layer count and clamped to 1–6.
export function normalizeCakeSizeLayers(raw: unknown): CakeSizeLayer[] {
  const entries = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  const seen = new Map<number, CakeSizeLayer>();
  for (const entry of entries) {
    let layers: number;
    let priceAdjustment = 0;
    if (typeof entry === "number") {
      layers = entry;
    } else if (entry && typeof entry === "object") {
      layers = Number((entry as { layers?: unknown }).layers);
      priceAdjustment = Math.round(Number((entry as { priceAdjustment?: unknown }).priceAdjustment) || 0);
    } else {
      continue;
    }
    if (!Number.isFinite(layers)) continue;
    layers = Math.min(6, Math.max(1, Math.round(layers)));
    if (!seen.has(layers)) seen.set(layers, { layers, priceAdjustment });
  }
  return [...seen.values()].sort((a, b) => a.layers - b.layers);
}

export function normalizeCakeLayers(raw: unknown): Record<string, CakeSizeLayer[]> {
  if (!raw || typeof raw !== "object") return {};
  const result: Record<string, CakeSizeLayer[]> = {};
  for (const [variantId, value] of Object.entries(raw as Record<string, unknown>)) {
    const layers = normalizeCakeSizeLayers(value);
    if (layers.length) result[variantId] = layers;
  }
  return result;
}

// The price adjustment for the layer count a customer chose (via the "Layers" selection).
// Zero when the product is not a layered cake or no matching layer option is stored.
export function cakeLayerAdjustment(
  product: Product,
  variantId: string,
  selections: readonly CartSelection[] | undefined,
) {
  if (product.category !== "CUSTOM_CAKES") return 0;
  const chosen = selections?.find((selection) => selection.group === "Layers")?.value;
  if (!chosen) return 0;
  const layers = Number(chosen);
  const option = product.cakeLayers?.[variantId]?.find((entry) => entry.layers === layers);
  return option?.priceAdjustment ?? 0;
}

// Authoritative per-unit price for a cart line: the size price plus any layer adjustment.
// Used by the server, the cart subtotal and every price display so they cannot drift.
export function lineUnitPrice(product: Product, variant: ProductVariant, selections?: readonly CartSelection[]) {
  return variantPrice(product, variant) + cakeLayerAdjustment(product, variant.id, selections);
}
export function productStartingPrice(product: Product) {
  const available = getPurchasableVariants(product);
  const variants = available.length ? available : getPublishedVariants(product);
  return variants.length
    ? Math.min(...variants.map((variant) => variantPrice(product, variant)))
    : (product.discountPrice ?? product.price);
}
// Lowest and highest price across the packs customers can choose (all packs while none are published).
export function productPriceRange(product: Product) {
  const published = getPublishedVariants(product);
  const variants = published.length ? published : product.variants;
  if (!variants.length) {
    const base = product.discountPrice ?? product.price;
    return { min: base, max: base };
  }
  const prices = variants.map((variant) => variantPrice(product, variant));
  return { min: Math.min(...prices), max: Math.max(...prices) };
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

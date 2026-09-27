import type { MarketingExport } from "@/types/content";
import type { Product } from "@/types";

export const marketingFormats: Record<MarketingExport["format"], { width: number; height: number; label: string }> = {
  square: { width: 1080, height: 1080, label: "Instagram square · 1080 × 1080" },
  portrait: { width: 1080, height: 1350, label: "Instagram portrait · 1080 × 1350" },
  story: { width: 1080, height: 1920, label: "Story / Reel cover · 1080 × 1920" },
};

export function marketingFilename(name: string, format: MarketingExport["format"]) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "product"}-${format}.png`;
}

export function marketingCaption(product: Product, price: string, siteUrl: string, callToAction: string) {
  const url = `${siteUrl.replace(/\/$/, "")}/product/${encodeURIComponent(product.slug)}`;
  return [product.name, product.shortDescription, `From ${price}`, callToAction, url].filter(Boolean).join("\n\n");
}

export function selectedMarketingProducts(products: Product[], productIds: string[]) {
  return productIds.flatMap((id) => products.find((product) => product.id === id && product.status === "ACTIVE") ?? []);
}

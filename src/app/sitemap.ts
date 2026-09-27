import type { MetadataRoute } from "next";
import { getProducts } from "@/lib/data/catalog";
import { getSiteUrl } from "@/lib/site-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getProducts();
  const base = getSiteUrl();
  return [
    "",
    "/shop",
    "/shop/pastries",
    "/custom-cakes",
    "/ready-to-bake",
    "/about",
    "/contact",
    "/faq",
    "/delivery-information",
    "/privacy",
    "/terms",
    "/refund-policy",
    ...products.map((product) => `/product/${product.slug}`),
  ].map((path) => ({ url: `${base}${path}`, lastModified: new Date() }));
}

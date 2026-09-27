import { isProductPurchasable } from "@/features/catalog/availability";
import type { Product } from "@/types";
import type { BusinessSettings } from "@/types/content";

function absoluteHttpUrl(value: string, siteUrl: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value, `${siteUrl}/`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function organizationJsonLd({
  business,
  logoUrl,
  siteUrl,
}: {
  business: BusinessSettings;
  logoUrl: string;
  siteUrl: string;
}) {
  const logo = absoluteHttpUrl(logoUrl, siteUrl);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl}/#organization`,
    name: business.businessName,
    url: siteUrl,
    ...(logo ? { logo } : {}),
    ...(business.contactEmail ? { email: business.contactEmail } : {}),
    ...(business.phone ? { telephone: business.phone } : {}),
    ...(business.address || business.province || business.postalCode
      ? {
          address: {
            "@type": "PostalAddress",
            ...(business.address ? { streetAddress: business.address } : {}),
            ...(business.province ? { addressRegion: business.province } : {}),
            ...(business.postalCode ? { postalCode: business.postalCode } : {}),
            addressCountry: business.country,
          },
        }
      : {}),
    ...(business.instagramUrl ? { sameAs: [business.instagramUrl] } : {}),
  };
}

export function productJsonLd({
  product,
  business,
  siteUrl,
}: {
  product: Product;
  business: BusinessSettings;
  siteUrl: string;
}) {
  const productUrl = `${siteUrl}/product/${encodeURIComponent(product.slug)}`;
  const images = Array.from(
    new Set(
      [product.image, ...(product.images ?? []).map((image) => image.url)]
        .map((image) => absoluteHttpUrl(image, siteUrl))
        .filter((image): image is string => Boolean(image)),
    ),
  );
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${productUrl}#product`,
    name: product.name,
    description: product.description || product.shortDescription,
    url: productUrl,
    ...(images.length ? { image: images } : {}),
    ...(product.sku ? { sku: product.sku } : {}),
    category: product.category.replaceAll("_", " ").toLowerCase(),
    brand: { "@id": `${siteUrl}/#organization` },
    offers: {
      "@type": "Offer",
      url: productUrl,
      priceCurrency: business.currency,
      price: ((product.discountPrice ?? product.price) / 100).toFixed(2),
      availability: isProductPurchasable(product) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@id": `${siteUrl}/#organization` },
    },
  };
}

export function productBreadcrumbJsonLd(product: Product, siteUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Shop", item: `${siteUrl}/shop` },
      {
        "@type": "ListItem",
        position: 3,
        name: product.name,
        item: `${siteUrl}/product/${encodeURIComponent(product.slug)}`,
      },
    ],
  };
}

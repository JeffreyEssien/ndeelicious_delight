import { describe, expect, it } from "vitest";
import type { Product } from "@/types";
import type { BusinessSettings } from "@/types/content";
import { organizationJsonLd, productBreadcrumbJsonLd, productJsonLd, serializeJsonLd } from "./seo";

const business = {
  businessName: "Ndeelicious Delight",
  contactEmail: "hello@example.ca",
  phone: "+1 555 0100",
  whatsapp: "",
  address: "10 Bakery Lane",
  country: "CA",
  province: "ON",
  postalCode: "A1A 1A1",
  locale: "en-CA",
  timezone: "America/Toronto",
  openingHours: "Monday to Friday",
  currency: "CAD",
  cakeLeadHours: 48,
  instagramUrl: "https://instagram.com/ndeelicious",
  deliveryEnabled: true,
  pickupEnabled: true,
  orderMinimum: 0,
  taxEnabled: true,
  taxLabel: "HST",
  taxRegistrationNumber: "",
  taxRateBps: 1300,
  taxDelivery: true,
} satisfies BusinessSettings;

const product = {
  id: "product-id",
  slug: "berry-cake",
  name: "Berry Cake",
  shortDescription: "Fresh berries and cream",
  description: "A celebration cake.",
  category: "CUSTOM_CAKES",
  price: 4500,
  discountPrice: 4000,
  sku: "CAKE-001",
  image: "/berry.jpg",
  images: [],
  status: "ACTIVE",
  trackInventory: false,
  stockQuantity: 0,
  lowStockThreshold: 2,
  variants: [{ id: "variant-id", name: "Standard", priceAdjustment: 0, stockQuantity: 0, active: true }],
  ingredients: "",
  allergens: [],
} satisfies Product;

describe("SEO structured data", () => {
  it("escapes executable HTML characters in JSON-LD", () => {
    const serialized = serializeJsonLd({ value: "</script><script>alert('xss')</script>&" });
    expect(serialized).not.toContain("<");
    expect(serialized).toContain("\\u003c/script\\u003e");
    expect(serialized).toContain("\\u0026");
  });

  it("builds organization data from owner-managed business settings", () => {
    expect(organizationJsonLd({ business, logoUrl: "/logo.jpg", siteUrl: "https://example.ca" })).toMatchObject({
      "@type": "Organization",
      "@id": "https://example.ca/#organization",
      name: "Ndeelicious Delight",
      logo: "https://example.ca/logo.jpg",
      address: { addressCountry: "CA", addressRegion: "ON" },
    });
  });

  it("builds a canonical product offer and breadcrumbs", () => {
    expect(productJsonLd({ product, business, siteUrl: "https://example.ca" })).toMatchObject({
      "@type": "Product",
      url: "https://example.ca/product/berry-cake",
      image: ["https://example.ca/berry.jpg"],
      offers: { price: "40.00", priceCurrency: "CAD", availability: "https://schema.org/InStock" },
    });
    expect(productBreadcrumbJsonLd(product, "https://example.ca")).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [{ position: 1 }, { position: 2 }, { position: 3, name: "Berry Cake" }],
    });
  });
});

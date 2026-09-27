import { describe, expect, it } from "vitest";
import { marketingExportSchema, storeCarouselSchema } from "./settings";

const validCarousel = {
  enabled: true,
  eyebrow: "From our kitchen",
  headline: "Today’s favourites",
  body: "Freshly made products.",
  productIds: ["72ac10f6-81bb-4f06-996c-e26865669a33"],
  style: "editorial" as const,
  autoplay: true,
  intervalMs: 6000,
  loop: true,
  showPrices: true,
  showAddToCart: true,
};

describe("storeCarouselSchema", () => {
  it("accepts a complete owner-managed carousel", () => {
    expect(storeCarouselSchema.parse(validCarousel)).toEqual(validCarousel);
  });

  it("rejects intervals that move too quickly to read", () => {
    expect(storeCarouselSchema.safeParse({ ...validCarousel, intervalMs: 1000 }).success).toBe(false);
  });

  it("limits the carousel to twelve database products", () => {
    const productIds = Array.from(
      { length: 13 },
      (_, index) => `72ac10f6-81bb-4f06-996c-e26865669a${index.toString().padStart(2, "0")}`,
    );
    expect(storeCarouselSchema.safeParse({ ...validCarousel, productIds }).success).toBe(false);
  });
});

describe("marketingExportSchema", () => {
  it("keeps marketing selection independent from carousel products", () => {
    const marketing = marketingExportSchema.parse({
      headline: "Made fresh for you",
      callToAction: "Order online",
      websiteUrl: "https://example.ca",
      format: "story",
      template: "brand",
      showLogo: true,
      showPrice: true,
      showSafeZone: true,
      logoUrl: "/logo.jpeg",
      productIds: ["72ac10f6-81bb-4f06-996c-e26865669a33"],
    });
    expect(marketing.productIds).toHaveLength(1);
    expect(marketing.template).toBe("brand");
  });
});

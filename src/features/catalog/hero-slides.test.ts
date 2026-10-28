import { describe, expect, it } from "vitest";
import { defaultStoreHero } from "@/content/default-hero";
import { products as fixtures } from "@/test/fixtures";
import type { Product } from "@/types";
import type { StoreHero, StoreHeroSlide } from "@/types/content";
import { storeHeroSchema } from "@/validations/settings";
import { resolveHeroSlides } from "./hero-slides";

const product = (slug: string, price: number, overrides: Partial<Product> = {}): Product => ({
  ...fixtures[0],
  id: slug,
  slug,
  name: slug,
  price,
  discountPrice: undefined,
  ...overrides,
});
const catalogue = [
  product("chicken-pies", 2600),
  product("sausage-rolls", 2400),
  product("meat-pies", 2200, { discountPrice: 1900 }),
  product("retired-pies", 1000, { status: "ARCHIVED" }),
];
const slide = (overrides: Partial<StoreHeroSlide> = {}): StoreHeroSlide => ({
  ...defaultStoreHero.slides[0],
  primaryHref: "",
  secondaryLabel: "",
  secondaryHref: "",
  ...overrides,
});
const resolve = (...slides: StoreHeroSlide[]) =>
  resolveHeroSlides({ ...defaultStoreHero, slides } satisfies StoreHero, catalogue);

describe("homepage hero slides", () => {
  it("uses a single product's live price and page", () => {
    const [shown] = resolve(slide({ productSlugs: ["chicken-pies"] }));
    expect(shown).toMatchObject({ price: 2600, priceFrom: false });
    expect(shown.primary.href).toBe("/product/chicken-pies");
    expect(shown.href).toBe("/product/chicken-pies");
  });

  it("shows the lowest price, sale prices included, as a starting price for several products", () => {
    const [shown] = resolve(slide({ productSlugs: ["chicken-pies", "sausage-rolls", "meat-pies"] }));
    expect(shown).toMatchObject({ price: 1900, priceFrom: true });
    // Several products have no single page, so the button falls back to the shop.
    expect(shown.primary.href).toBe("/shop");
  });

  it("skips missing and unpublished products", () => {
    const [shown] = resolve(slide({ productSlugs: ["gone", "retired-pies", "sausage-rolls"] }));
    expect(shown).toMatchObject({ price: 2400, priceFrom: false });
    expect(shown.primary.href).toBe("/product/sausage-rolls");
    const [empty] = resolve(slide({ productSlugs: ["gone", "retired-pies"] }));
    expect(empty.price).toBeUndefined();
  });

  it("prefers the owner's own button link and hides the price when asked", () => {
    const [shown] = resolve(slide({ productSlugs: ["chicken-pies"], primaryHref: "/ready-to-bake", showPrice: false }));
    expect(shown.primary.href).toBe("/ready-to-bake");
    expect(shown.price).toBeUndefined();
  });

  it("only shows a second link with both its text and destination", () => {
    expect(resolve(slide({ secondaryLabel: "See more" }))[0].secondary).toBeUndefined();
    expect(resolve(slide({ secondaryLabel: "See more", secondaryHref: "/shop" }))[0].secondary).toEqual({
      label: "See more",
      href: "/shop",
    });
  });

  it("names each slide for the slide dots, falling back to its headline", () => {
    expect(resolve(slide({ label: "", headline: "Charge\nyour day." }))[0].label).toBe("Charge your day.");
  });
});

describe("hero settings", () => {
  it("accepts the built-in hero", () => {
    expect(storeHeroSchema.safeParse(defaultStoreHero).success).toBe(true);
  });

  it("rejects slides without an image, headline or button label, with the owner's wording", () => {
    for (const [field, message] of [
      ["image", "Choose an image for every slide."],
      ["headline", "Give every slide a headline."],
      ["primaryLabel", "Give every slide a button label."],
    ] as const) {
      const result = storeHeroSchema.safeParse({ ...defaultStoreHero, slides: [slide({ [field]: "" })] });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(message);
    }
    expect(storeHeroSchema.safeParse({ ...defaultStoreHero, slides: [] }).success).toBe(false);
  });

  it("only allows site paths or secure links for buttons", () => {
    const result = storeHeroSchema.safeParse({
      ...defaultStoreHero,
      slides: [slide({ primaryHref: "javascript:alert(1)" })],
    });
    expect(result.success).toBe(false);
  });
});

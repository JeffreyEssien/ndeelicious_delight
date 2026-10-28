import type { HeroSlide } from "@/components/layout/hero-showcase";
import type { Product } from "@/types";
import type { StoreHero } from "@/types/content";

// Turns the saved hero into what the homepage shows. Each slide's products supply its price
// (the lowest, marked "from" when there are several) and, for a single product, the order link.
// Products that are missing or unpublished are skipped, so a slide never shows a stale price.
export function resolveHeroSlides(hero: StoreHero, products: Product[]): HeroSlide[] {
  return hero.slides.map((slide) => {
    const linked = slide.productSlugs.flatMap((slug) => {
      const product = products.find((item) => item.slug === slug && item.status === "ACTIVE");
      return product ? [product] : [];
    });
    const prices = linked.map((product) => product.discountPrice ?? product.price);
    const productHref = linked.length === 1 ? `/product/${encodeURIComponent(linked[0].slug)}` : undefined;
    const primaryHref = slide.primaryHref || productHref || "/shop";
    return {
      src: slide.image,
      alt: slide.imageAlt,
      label: slide.label || slide.headline.replace(/\s+/g, " "),
      href: primaryHref,
      eyebrow: slide.eyebrow,
      headline: slide.headline,
      body: slide.body,
      price: slide.showPrice && prices.length ? Math.min(...prices) : undefined,
      priceFrom: linked.length > 1,
      priceNote: slide.priceNote || undefined,
      primary: { label: slide.primaryLabel, href: primaryHref },
      secondary:
        slide.secondaryLabel && slide.secondaryHref
          ? { label: slide.secondaryLabel, href: slide.secondaryHref }
          : undefined,
    };
  });
}

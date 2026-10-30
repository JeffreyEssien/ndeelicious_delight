import { getCustomerText } from "@/lib/customer-text";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ProductGrid } from "@/components/product/product-grid";
import { ProductCarousel } from "@/components/product/product-carousel";
import { ContentLines } from "@/components/ui/content-lines";
import { Icon } from "@/components/ui/icons";
import { getCollections, getProducts } from "@/lib/data/catalog";
import { productStartingPrice } from "@/features/catalog/pricing";
import { formatMoney } from "@/lib/format";
import { CakeCategories, type CakeCategoryTile } from "@/components/layout/cake-categories";
import { KitchenGallery, type KitchenPhoto } from "@/components/layout/kitchen-gallery";
import { isProductPurchasable } from "@/features/catalog/availability";
import { HeroShowcase } from "@/components/layout/hero-showcase";
import { resolveHeroSlides } from "@/features/catalog/hero-slides";
import { FindUs } from "@/components/layout/find-us";
import { Stockists } from "@/components/layout/stockists";
import { NewsletterForm } from "@/components/layout/newsletter-form";
import { getApprovedReviews } from "@/lib/data/reviews";
import { getBusinessSettings, getStoreCarousel, getStoreHero, getStorefrontContent } from "@/lib/data/settings";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function Home() {
  const t = await getCustomerText("Page: (storefront)");

  const [products, content, business, reviews, carousel, hero, collections] = await Promise.all([
    getProducts(),
    getStorefrontContent(),
    getBusinessSettings(),
    getApprovedReviews(),
    getStoreCarousel(),
    getStoreHero(),
    getCollections(),
  ]);
  const home = content.home;
  // Lead with the owner's featured picks, then top up with other available products so
  // the row never looks sparse when only a couple are flagged as featured.
  const featured = [
    ...products.filter((product) => product.featured),
    ...products.filter((product) => !product.featured && isProductPurchasable(product)),
  ].slice(0, 4);
  // One photo per product so the kitchen gallery never repeats the same bake, favouring
  // what customers can order right now. Ready to order comes first so it leads the mix.
  const kitchenTypes = [
    {
      type: "PASTRIES",
      label: t("Ready to order"),
      href: "/shop?category=PASTRIES",
      linkLabel: t("See all ready to order"),
    },
    { type: "CUSTOM_CAKES", label: t("Cakes"), href: "/custom-cakes", linkLabel: t("See all cakes") },
    { type: "READY_TO_BAKE", label: t("Ready to bake"), href: "/ready-to-bake", linkLabel: t("See all ready to bake") },
  ];
  const gallery: KitchenPhoto[] = [
    ...products.filter((product) => isProductPurchasable(product)),
    ...products.filter((product) => !isProductPurchasable(product)),
  ]
    .map((product) => {
      const photo = product.images?.[0];
      const url = photo?.url ?? product.image;
      const type = kitchenTypes.find((item) => item.type === product.category);
      return url && type
        ? {
            id: product.id,
            url,
            alt: photo?.altText || product.name,
            name: product.name,
            slug: product.slug,
            position: product.imagePosition,
            type: type.type,
            typeLabel: type.label,
          }
        : null;
    })
    .filter((item) => item !== null);
  const kitchenFilters = kitchenTypes.filter((item) => gallery.some((photo) => photo.type === item.type));
  const heroSlides = resolveHeroSlides(hero, products);
  // One tile per cake sub-category that has cakes, its photo rotating through those cakes.
  const money = (value: number) => formatMoney(value, business.currency, business.locale);
  const cakeTiles: CakeCategoryTile[] = collections
    .filter((collection) => collection.parent === "CUSTOM_CAKES")
    .map((collection) => {
      const cakes = products.filter(
        (product) => product.category === "CUSTOM_CAKES" && product.collectionId === collection.id,
      );
      const ordered = [...cakes.filter(isProductPurchasable), ...cakes.filter((cake) => !isProductPurchasable(cake))];
      const photos = ordered
        .map((cake) => {
          const url = cake.images?.[0]?.url ?? cake.image;
          return url ? { url, alt: cake.images?.[0]?.altText || cake.name, position: cake.imagePosition } : null;
        })
        .filter((photo) => photo !== null)
        .slice(0, 5);
      const from = cakes.length ? Math.min(...cakes.map(productStartingPrice)) : 0;
      return {
        id: collection.id,
        name: collection.name,
        href: `/custom-cakes?collection=${encodeURIComponent(collection.id)}`,
        detail: [
          cakes.length === 1 ? t("1 cake") : t("{count} cakes", { count: cakes.length }),
          from ? t("From {price}", { price: money(from) }) : "",
        ]
          .filter(Boolean)
          .join(" · "),
        photos,
      };
    })
    .filter((tile) => tile.photos.length > 0);
  return (
    <>
      <HeroShowcase
        slides={heroSlides}
        label={hero.label}
        fromLabel={hero.fromLabel}
        perks={hero.perks.filter(Boolean)}
        intervalMs={hero.intervalMs}
      />
      <section className="section site-container">
        <div className="section-head">
          <div>
            <span className="overline">{home.intro.eyebrow}</span>
            <h2>
              <ContentLines text={home.intro.headline} />
            </h2>
          </div>
          <p>{home.intro.body}</p>
        </div>
        <div className="category-showcase">
          {home.categories.map((category, index) => (
            <Link href={category.href} key={category.href}>
              <Image src={category.image} alt={category.imageAlt} fill sizes={"(max-width:700px) 100vw, 33vw"} />
              <span>
                {String(index + 1).padStart(2, "0")} · {category.eyebrow}
              </span>
              <div>
                <h3>{category.title}</h3>
                <p>{category.body}</p>
                <b>
                  {category.linkLabel} <Icon name="arrow" />
                </b>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <ProductCarousel products={products} settings={carousel} />
      <section className="section section-tint">
        <div className="site-container">
          <div className="section-title-row">
            <div>
              <span className="overline">{home.featured.eyebrow}</span>
              <h2>{home.featured.headline}</h2>
            </div>
            <Link className="inline-link" href="/shop">
              {home.featured.linkLabel} <Icon name="arrow" />
            </Link>
          </div>
          {featured.length ? (
            <ProductGrid items={featured} />
          ) : (
            <p>{t("No featured products are currently published.")}</p>
          )}
        </div>
      </section>
      {cakeTiles.length > 0 && (
        <section className="section cake-cats-section">
          <div className="site-container">
            <div className="section-title-row">
              <div>
                <span className="overline">{home.cakeFeature.eyebrow}</span>
                <h2>
                  <ContentLines text={home.cakeFeature.headline} />
                </h2>
                {home.cakeFeature.body && <p className="cake-cats-intro">{home.cakeFeature.body}</p>}
              </div>
              <Link className="inline-link" href="/custom-cakes">
                {home.cakeFeature.buttonLabel} <Icon name="arrow" />
              </Link>
            </div>
            <CakeCategories tiles={cakeTiles} />
          </div>
        </section>
      )}
      <section className="ready-feature">
        <div className="site-container ready-grid">
          <div>
            <span className="overline">{home.readyFeature.eyebrow}</span>
            <h2>
              <ContentLines text={home.readyFeature.headline} />
            </h2>
            <p>{home.readyFeature.body}</p>
            <Link href="/ready-to-bake" className="button button-secondary">
              {home.readyFeature.buttonLabel} <Icon name="arrow" />
            </Link>
          </div>
          <div className="ready-image">
            <Image
              src={home.readyFeature.image}
              alt={home.readyFeature.imageAlt}
              fill
              sizes={"(max-width:800px) 100vw, 50vw"}
            />
          </div>
        </div>
        {Boolean(content.readyToBake.stockists?.length) && (
          <div className="site-container ready-stockists">
            <div className="ready-stockists-head">
              <div>
                <span className="overline">{t("Also in stores")}</span>
                <h3>{t("Pick up a box near you")}</h3>
              </div>
              <p>{t("Our frozen pies and sausage rolls are stocked across Halifax and Dartmouth.")}</p>
            </div>
            <Stockists stockists={content.readyToBake.stockists ?? []} variant="strip" />
          </div>
        )}
      </section>
      {!!gallery.length && (
        <section className="section gallery-section">
          <div className="site-container">
            <div className="gallery-head">
              <div>
                <span className="overline">{home.gallery.eyebrow}</span>
                <h2>{home.gallery.headline}</h2>
              </div>
              {business.instagramUrl && (
                <a className="gallery-follow" href={business.instagramUrl} target={"_blank"} rel={"noreferrer"}>
                  <Icon name="instagram" />
                  {t("Follow along on Instagram")}
                </a>
              )}
            </div>
            <KitchenGallery
              photos={gallery}
              filters={kitchenFilters}
              allLabel={t("All")}
              allHref="/shop"
              allLinkLabel={t("Shop everything")}
            />
          </div>
        </section>
      )}
      <FindUs business={business} />
      {reviews.length > 0 && (
        <section className="section section-tint testimonials-section">
          <div className="site-container">
            <div className="section-head">
              <div>
                <span className="overline">{t("Loved by locals")}</span>
                <h2>{t("Tales of taste & joy")}</h2>
              </div>
            </div>
            <div className="testimonial-grid">
              {reviews.slice(0, 3).map((item) => (
                <blockquote key={item.id} className="testimonial-card">
                  <span className="quote">“</span>
                  <p>{item.body}</p>
                  <cite>
                    {item.customerName}
                    {item.rating ? ` · ${"★".repeat(item.rating)}` : ""}
                  </cite>
                </blockquote>
              ))}
            </div>
          </div>
        </section>
      )}
      <section className="values site-container">
        {home.values.map((value, index) => (
          <div key={value.title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <h3>{value.title}</h3>
            <p>{value.body}</p>
          </div>
        ))}
      </section>
      <section className="newsletter-band">
        <div className="site-container">
          <div>
            <span className="overline">{t("Stay in the loop")}</span>
            <h2>{content.global.newsletterTitle}</h2>
            <p>{content.global.newsletterText}</p>
          </div>
          <NewsletterForm />
        </div>
      </section>
    </>
  );
}

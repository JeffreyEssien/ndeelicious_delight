import { getCustomerText } from "@/lib/customer-text";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ProductGrid } from "@/components/product/product-grid";
import { ProductCarousel } from "@/components/product/product-carousel";
import { ContentLines } from "@/components/ui/content-lines";
import { Icon } from "@/components/ui/icons";
import { getProducts } from "@/lib/data/catalog";
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

  const [products, content, business, reviews, carousel, hero] = await Promise.all([
    getProducts(),
    getStorefrontContent(),
    getBusinessSettings(),
    getApprovedReviews(),
    getStoreCarousel(),
    getStoreHero(),
  ]);
  const home = content.home;
  // Lead with the owner's featured picks, then top up with other available products so
  // the row never looks sparse when only a couple are flagged as featured.
  const featured = [
    ...products.filter((product) => product.featured),
    ...products.filter((product) => !product.featured && isProductPurchasable(product)),
  ].slice(0, 4);
  // One photo per product so the kitchen gallery never repeats the same bake, favouring
  // what customers can order right now.
  const gallery = [
    ...products.filter((product) => isProductPurchasable(product)),
    ...products.filter((product) => !isProductPurchasable(product)),
  ]
    .map((product) => {
      const photo = product.images?.[0];
      const url = photo?.url ?? product.image;
      return url
        ? {
            id: product.id,
            url,
            alt: photo?.altText || product.name,
            name: product.name,
            slug: product.slug,
            position: product.imagePosition,
          }
        : null;
    })
    .filter((item) => item !== null)
    .slice(0, 5);
  const heroSlides = resolveHeroSlides(hero, products);
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
      <section className="editorial">
        <div className="editorial-image">
          <Image
            src={home.cakeFeature.image}
            alt={home.cakeFeature.imageAlt}
            fill
            sizes={"(max-width:800px) 100vw, 50vw"}
          />
        </div>
        <div className="editorial-copy">
          <span className="overline">{home.cakeFeature.eyebrow}</span>
          <h2>{home.cakeFeature.headline}</h2>
          <p>{home.cakeFeature.body}</p>
          <ol>
            {home.cakeFeature.steps.map((step, index) => (
              <li key={step}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <Link className="button button-primary" href="/custom-cakes">
            {home.cakeFeature.buttonLabel} <Icon name="arrow" />
          </Link>
        </div>
      </section>
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
            <div className="kitchen-gallery" data-count={gallery.length}>
              {gallery.map((item, index) => (
                <Link className="kitchen-tile" href={`/product/${item.slug}`} key={item.id}>
                  <Image
                    src={item.url}
                    alt={item.alt}
                    fill
                    sizes={index === 0 ? "(max-width:800px) 100vw, 50vw" : "(max-width:800px) 50vw, 25vw"}
                    style={item.position ? { objectPosition: item.position } : undefined}
                  />
                  <span className="kitchen-caption">
                    {item.name} <Icon name="arrow" />
                  </span>
                </Link>
              ))}
            </div>
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

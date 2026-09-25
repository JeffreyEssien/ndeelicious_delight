import Image from "next/image";
import Link from "next/link";
import { ProductGrid } from "@/components/product/product-grid";
import { ContentLines } from "@/components/ui/content-lines";
import { Icon } from "@/components/ui/icons";
import { getProducts } from "@/lib/data/catalog";
import { getApprovedReviews } from "@/lib/data/reviews";
import { getBusinessSettings, getStorefrontContent } from "@/lib/data/settings";

export default async function Home() {
  const [products, content, business, reviews] = await Promise.all([
    getProducts(),
    getStorefrontContent(),
    getBusinessSettings(),
    getApprovedReviews(),
  ]);
  const home = content.home;
  const featured = products.filter((product) => product.featured);
  const gallery = products.flatMap((product) => product.images ?? []).slice(0, 4);
  const review = reviews[0];
  return (
    <>
      <section className="hero">
        <Image src={home.hero.image ?? ""} alt={home.hero.imageAlt ?? ""} fill loading="eager" sizes="100vw" />
        <div className="hero-shade" />
        <div className="site-container hero-content">
          <span className="overline">{home.hero.eyebrow}</span>
          <h1>
            <ContentLines text={home.hero.headline} />
          </h1>
          <p>{home.hero.supportingText}</p>
          <div className="hero-buttons">
            <Link className="button button-primary" href={home.hero.primaryHref}>
              {home.hero.primaryLabel} <Icon name="arrow" />
            </Link>
            <Link className="button button-link" href={home.hero.secondaryHref}>
              {home.hero.secondaryLabel}
            </Link>
          </div>
        </div>
      </section>
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
              <Image src={category.image} alt={category.imageAlt} fill sizes="(max-width:700px) 100vw, 33vw" />
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
          {featured.length ? <ProductGrid items={featured} /> : <p>No featured products are currently published.</p>}
        </div>
      </section>
      <section className="editorial">
        <div className="editorial-image">
          <Image
            src={home.cakeFeature.image}
            alt={home.cakeFeature.imageAlt}
            fill
            sizes="(max-width:800px) 100vw, 50vw"
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
              sizes="(max-width:800px) 100vw, 50vw"
            />
          </div>
        </div>
      </section>
      {review && (
        <section className="testimonials section">
          <div className="site-container">
            <span className="quote">“</span>
            <blockquote>{review.body}</blockquote>
            <p>
              <b>{review.customerName}</b>
            </p>
          </div>
        </section>
      )}
      {!!gallery.length && (
        <section className="section gallery-section">
          <div className="site-container">
            <div className="section-title-row">
              <div>
                <span className="overline">{home.gallery.eyebrow}</span>
                <h2>{home.gallery.headline}</h2>
              </div>
              {business.instagramUrl && (
                <a className="inline-link" href={business.instagramUrl} target="_blank" rel="noreferrer">
                  Follow along ↗
                </a>
              )}
            </div>
            <div className="social-gallery">
              {gallery.map((image) => (
                <div key={image.id}>
                  <Image src={image.url} alt={image.altText} fill sizes="33vw" />
                </div>
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
    </>
  );
}

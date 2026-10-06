import { getCustomerText } from "@/lib/customer-text";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductPurchase } from "@/components/product/product-purchase";
import { ProductGallery } from "@/components/product/product-gallery";
import { ProductReviews } from "@/components/product/product-reviews";
import { ProductGrid } from "@/components/product/product-grid";
import { formatMoney } from "@/lib/format";
import { getProduct, getProducts } from "@/lib/data/catalog";
import { Badge } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icons";
import { getBusinessSettings, getStorefrontContent } from "@/lib/data/settings";
import { getApprovedReviews } from "@/lib/data/reviews";
import { getSiteUrl } from "@/lib/site-url";
import { productBreadcrumbJsonLd, productJsonLd, serializeJsonLd } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const t = await getCustomerText("Page: Product");

  const p = await getProduct((await params).slug);
  if (!p) return { title: t("Product not found"), robots: { index: false, follow: false } };
  const path = `/product/${encodeURIComponent(p.slug)}`;
  const images = p.image ? [{ url: p.image, alt: p.images?.[0]?.altText || p.name }] : [];
  return {
    title: p.name,
    description: p.shortDescription,
    alternates: { canonical: path },
    openGraph: {
      title: p.name,
      description: p.shortDescription,
      url: path,
      type: "website",
      images,
    },
    twitter: { card: "summary_large_image", title: p.name, description: p.shortDescription, images },
  };
}
export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const t = await getCustomerText("Page: Product");

  const product = await getProduct((await params).slug);
  if (!product) notFound();
  const [products, content, reviews, business] = await Promise.all([
    getProducts(),
    getStorefrontContent(),
    getApprovedReviews(product.id),
    getBusinessSettings(),
  ]);
  const related = products.filter((p) => p.category === product.category && p.id !== product.id).slice(0, 3);
  const siteUrl = getSiteUrl();
  const structuredData = [productJsonLd({ product, business, siteUrl }), productBreadcrumbJsonLd(product, siteUrl)];
  return (
    <>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: serializeJsonLd escapes HTML-significant characters. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />
      <div className="site-container breadcrumbs">
        <Link href="/">{t("Home")}</Link>
        <span>/</span>
        <Link href="/shop">{t("Shop")}</Link>
        <span>/</span>
        <span>{product.name}</span>
      </div>
      <section className="site-container product-detail">
        <ProductGallery product={product} />
        <div className="product-copy">
          {product.badge && <Badge tone={"berry"}>{product.badge}</Badge>}
          <h1>{product.name}</h1>
          <div className="product-price">
            {formatMoney(product.price, business.currency, business.locale)}
            {t(" ")}
            {product.compareAtPrice && <s>{formatMoney(product.compareAtPrice, business.currency, business.locale)}</s>}
          </div>
          <p className="lead">{product.shortDescription}</p>
          <ProductPurchase product={product} />
          <div className="reassurance">
            <p>
              <Icon name="truck" />
              <span>
                <b>{content.product.deliveryTitle}</b>
                <small>{content.product.deliveryText}</small>
              </span>
            </p>
            <p>
              <Icon name="clock" />
              <span>
                <b>{content.product.preparationTitle}</b>
                <small>{content.product.preparationText}</small>
              </span>
            </p>
          </div>
          <details open>
            <summary>{t("Description")}</summary>
            <p>{product.description}</p>
          </details>
          <details>
            <summary>{t("Ingredients & allergens")}</summary>
            <p>{product.ingredients}</p>
            <p>
              <b>{t("Contains:")}</b> {product.allergens.join(", ")}
            </p>
          </details>
          {(product.storageInstructions || product.preparationInstructions) && (
            <details>
              <summary>{t("Storage & preparation")}</summary>
              {product.storageInstructions && <p>{product.storageInstructions}</p>}
              {product.preparationInstructions && <p>{product.preparationInstructions}</p>}
            </details>
          )}
        </div>
      </section>
      <ProductReviews productId={product.id} productName={product.name} reviews={reviews} />
      {!!related.length && (
        <section className="section section-tint">
          <div className="site-container">
            <div className="section-title-row">
              <h2>{t("You may also love")}</h2>
              <Link className="inline-link" href="/shop">
                {t("Shop all")}
                <Icon name="arrow" />
              </Link>
            </div>
            <ProductGrid items={related} />
          </div>
        </section>
      )}
    </>
  );
}

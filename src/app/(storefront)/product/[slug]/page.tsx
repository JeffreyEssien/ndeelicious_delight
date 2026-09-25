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

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getProduct((await params).slug);
  return p ? { title: p.name, description: p.shortDescription } : {};
}
export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const product = await getProduct((await params).slug);
  if (!product) notFound();
  const [products, content, reviews, business] = await Promise.all([
    getProducts(),
    getStorefrontContent(),
    getApprovedReviews(product.id),
    getBusinessSettings(),
  ]);
  const related = products.filter((p) => p.category === product.category && p.id !== product.id).slice(0, 3);
  return (
    <>
      <div className="site-container breadcrumbs">
        <Link href="/">Home</Link>
        <span>/</span>
        <Link href="/shop">Shop</Link>
        <span>/</span>
        <span>{product.name}</span>
      </div>
      <section className="site-container product-detail">
        <ProductGallery product={product} />
        <div className="product-copy">
          {product.badge && <Badge tone="berry">{product.badge}</Badge>}
          <h1>{product.name}</h1>
          <div className="product-price">
            {formatMoney(product.price, business.currency, business.locale)}{" "}
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
            <summary>Description</summary>
            <p>{product.description}</p>
          </details>
          <details>
            <summary>Ingredients & allergens</summary>
            <p>{product.ingredients}</p>
            <p>
              <b>Contains:</b> {product.allergens.join(", ")}
            </p>
          </details>
          {(product.storageInstructions || product.preparationInstructions) && (
            <details>
              <summary>Storage & preparation</summary>
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
              <h2>You may also love</h2>
              <Link className="inline-link" href="/shop">
                Shop all <Icon name="arrow" />
              </Link>
            </div>
            <ProductGrid items={related} />
          </div>
        </section>
      )}
    </>
  );
}

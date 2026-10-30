import { getCustomerText } from "@/lib/customer-text";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Image from "next/image";
import { ProductGrid } from "@/components/product/product-grid";
import { ContentLines } from "@/components/ui/content-lines";
import { Stockists } from "@/components/layout/stockists";
import { Icon } from "@/components/ui/icons";
import { getProducts } from "@/lib/data/catalog";
import { getStoreAppearance, getStorefrontContent } from "@/lib/data/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getCustomerText("page titles");
  return { title: t("Ready to bake"), alternates: { canonical: "/ready-to-bake" } };
}
export default async function Page() {
  const t = await getCustomerText("Page: ready-to-bake");

  const [products, content, appearance] = await Promise.all([
    getProducts(),
    getStorefrontContent(),
    getStoreAppearance(),
  ]);
  const page = content.readyToBake;
  const items = products.filter((product) => product.category === "READY_TO_BAKE");
  const stockists = page.stockists ?? [];
  return (
    <>
      <section className="rtb-hero">
        <div className="site-container rtb-hero-grid">
          <div className="rtb-hero-copy">
            <span className="overline">{page.hero.eyebrow}</span>
            <h1>
              <ContentLines text={page.hero.headline} />
            </h1>
            <p>{page.hero.supportingText}</p>
            <div className="rtb-hero-actions">
              <a className="button rtb-cta" href="#range">
                {t("Shop the range")} <Icon name="arrow" />
              </a>
              {!!stockists.length && (
                <a className="button rtb-cta-ghost" href="#stores">
                  {t("Find a store")}
                </a>
              )}
            </div>
            {(items.length > 0 || stockists.length > 0) && (
              <dl className="rtb-facts">
                {items.length > 0 && (
                  <div>
                    <dt>{items.length}</dt>
                    <dd>{items.length === 1 ? t("box to choose") : t("boxes to choose from")}</dd>
                  </div>
                )}
                {stockists.length > 0 && (
                  <div>
                    <dt>{stockists.length}</dt>
                    <dd>{stockists.length === 1 ? t("store near you") : t("stores across HRM")}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>
          <div className="rtb-hero-art">
            <div className="rtb-hero-frame">
              <Image
                src={page.hero.image ?? ""}
                alt={page.hero.imageAlt ?? ""}
                fill
                priority
                sizes={"(max-width:900px) 100vw, 50vw"}
              />
            </div>
            <span className="rtb-sticker" aria-hidden="true">
              {t("Just bake")}
            </span>
          </div>
        </div>
      </section>
      <section
        className="site-container section rtb-range"
        id="range"
        // A short range fills the row instead of leaving empty columns.
        style={{ "--product-columns": Math.max(1, Math.min(items.length, appearance.productColumns)) } as CSSProperties}
      >
        <div className="section-title-row">
          <div>
            <span className="overline">{page.section.eyebrow}</span>
            <h2>{page.section.headline}</h2>
          </div>
        </div>
        {items.length ? (
          <ProductGrid items={items} />
        ) : (
          <p>{t("No ready-to-bake products are currently published.")}</p>
        )}
      </section>
      {!!page.steps.length && (
        <section className="rtb-steps">
          <div className="site-container">
            <span className="overline">{t("How to bake")}</span>
            <h2>{t("Freezer. Oven. Applause.")}</h2>
            <ol>
              {page.steps.map((step, index) => (
                <li key={step.title}>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}
      {!!stockists.length && (
        <section className="site-container section stockists-section rtb-stores" id="stores">
          <div className="rtb-stores-head">
            <div>
              <span className="overline">{t("Available across Halifax HRM")}</span>
              <h2>{t("Find us in stores")}</h2>
            </div>
            <p>{t("Call ahead to check what’s in the freezer.")}</p>
          </div>
          <Stockists stockists={stockists} variant="strip" />
        </section>
      )}
    </>
  );
}

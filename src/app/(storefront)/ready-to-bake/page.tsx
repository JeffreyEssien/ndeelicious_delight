import { getCustomerText } from "@/lib/customer-text";
import type { Metadata } from "next";
import Image from "next/image";
import { ProductGrid } from "@/components/product/product-grid";
import { ContentLines } from "@/components/ui/content-lines";
import { getProducts } from "@/lib/data/catalog";
import { getStorefrontContent } from "@/lib/data/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getCustomerText("page titles");
  return { title: t("Ready to bake"), alternates: { canonical: "/ready-to-bake" } };
}
export default async function Page() {
  const t = await getCustomerText("Page: ready-to-bake");

  const [products, content] = await Promise.all([getProducts(), getStorefrontContent()]);
  const page = content.readyToBake;
  const items = products.filter((product) => product.category === "READY_TO_BAKE");
  return (
    <>
      <section className="split-hero">
        <div>
          <span className="overline">{page.hero.eyebrow}</span>
          <h1>
            <ContentLines text={page.hero.headline} />
          </h1>
          <p>{page.hero.supportingText}</p>
        </div>
        <div>
          <Image
            src={page.hero.image ?? ""}
            alt={page.hero.imageAlt ?? ""}
            fill
            priority
            sizes={"(max-width:800px) 100vw, 50vw"}
          />
        </div>
      </section>
      <section className="site-container section">
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
        <div className="instruction-grid">
          {page.steps.map((step, index) => (
            <div key={step.title}>
              <b>{index + 1}</b>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          ))}
        </div>
      </section>
      {Boolean(page.stockists?.length) && (
        <section className="site-container section">
          <span className="overline">{t("Available across Halifax HRM")}</span>
          <h2>{t("Find us in stores")}</h2>
          <p>
            {t(
              "Meat pies, chicken pies and beef sausage rolls, frozen and ready to bake. Contact each store for current stock, prices and opening hours.",
            )}
          </p>
          <ul>
            {page.stockists?.map((store) => (
              <li key={store.url}>
                <a href={store.url}>{store.name}</a> — {store.city}
              </li>
            ))}
          </ul>
          <p>{t("For purchases made in store, contact that retailer with your receipt for support.")}</p>
        </section>
      )}
    </>
  );
}

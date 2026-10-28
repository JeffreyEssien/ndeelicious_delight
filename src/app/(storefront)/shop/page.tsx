import { getCustomerText } from "@/lib/customer-text";
import type { Metadata } from "next";
import { Catalogue } from "@/components/product/catalogue";
import { ContentLines } from "@/components/ui/content-lines";
import { getCakeConfiguration, getStorefrontContent } from "@/lib/data/settings";
import { getCollections } from "@/lib/data/catalog";
import { parseShopCategory, parseShoppingMode } from "@/features/catalog/shop-filters";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getCustomerText("page titles");
  return {
    title: t("Shop the bakery"),
    description: t("Browse the live bakery catalogue."),
    alternates: { canonical: "/shop" },
  };
}
export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; maxPrice?: string; mode?: string; collection?: string }>;
}) {
  const [params, content, cakeConfiguration, collections] = await Promise.all([
    searchParams,
    getStorefrontContent(),
    getCakeConfiguration(),
    getCollections(),
  ]);
  const category = parseShopCategory(params.category);
  const mode = parseShoppingMode(params.mode);
  const maximumPrice =
    params.maxPrice && Number(params.maxPrice) > 0 ? Math.round(Number(params.maxPrice) * 100) : undefined;
  const header = content.headers.shop;
  return (
    <>
      <header className="page-hero small shop-hero">
        <span className="overline">{header.eyebrow}</span>
        <h1>
          <ContentLines text={header.headline} />
        </h1>
        <p>{header.supportingText}</p>
      </header>
      <section className="site-container catalogue-section">
        {/* Remount when a link changes the filters, since the catalogue keeps them in local state. */}
        <Catalogue
          key={`${category ?? ""}|${mode ?? ""}|${params.collection ?? ""}`}
          initialCategory={category}
          initialMode={mode}
          maximumPrice={maximumPrice}
          cakeConfiguration={cakeConfiguration}
          budgetContent={content.shopBudget}
          collections={collections}
          initialCollection={params.collection}
        />
      </section>
    </>
  );
}

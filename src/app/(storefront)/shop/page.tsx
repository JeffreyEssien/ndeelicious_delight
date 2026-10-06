import { getCustomerText } from "@/lib/customer-text";
import type { Metadata } from "next";
import { Catalogue } from "@/components/product/catalogue";
import { ContentLines } from "@/components/ui/content-lines";
import { getCakeConfiguration, getStorefrontContent } from "@/lib/data/settings";
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
  searchParams: Promise<{ category?: string; maxPrice?: string }>;
}) {
  const [params, content, cakeConfiguration] = await Promise.all([
    searchParams,
    getStorefrontContent(),
    getCakeConfiguration(),
  ]);
  const category = params.category as "PASTRIES" | "READY_TO_BAKE" | "CUSTOM_CAKES" | undefined;
  const maximumPrice =
    params.maxPrice && Number(params.maxPrice) > 0 ? Math.round(Number(params.maxPrice) * 100) : undefined;
  const header = content.headers.shop;
  return (
    <>
      <header className="page-hero small">
        <span className="overline">{header.eyebrow}</span>
        <h1>
          <ContentLines text={header.headline} />
        </h1>
        <p>{header.supportingText}</p>
      </header>
      <section className="site-container catalogue-section">
        <Catalogue
          initialCategory={category}
          maximumPrice={maximumPrice}
          cakeConfiguration={cakeConfiguration}
          budgetContent={content.shopBudget}
        />
      </section>
    </>
  );
}

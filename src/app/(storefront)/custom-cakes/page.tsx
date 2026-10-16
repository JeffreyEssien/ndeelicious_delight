import { getCustomerText } from "@/lib/customer-text";
import type { Metadata } from "next";
import { Catalogue } from "@/components/product/catalogue";
import { ContentLines } from "@/components/ui/content-lines";
import { getCakeConfiguration, getStorefrontContent } from "@/lib/data/settings";
import { getCollections } from "@/lib/data/catalog";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getCustomerText("page titles");
  return {
    title: t("Cakes"),
    description: t("Choose a cake, pick your size and flavours, and order."),
    alternates: { canonical: "/custom-cakes" },
  };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ maxPrice?: string; collection?: string }>;
}) {
  const [params, content, cakeConfiguration, collections] = await Promise.all([
    searchParams,
    getStorefrontContent(),
    getCakeConfiguration(),
    getCollections(),
  ]);
  const hero = content.customCakes.hero;
  const maximumPrice =
    params.maxPrice && Number(params.maxPrice) > 0 ? Math.round(Number(params.maxPrice) * 100) : undefined;
  return (
    <>
      <header className="page-hero small">
        <span className="overline">{hero.eyebrow}</span>
        <h1>
          <ContentLines text={hero.headline} />
        </h1>
        <p>{hero.supportingText}</p>
      </header>
      <section className="site-container catalogue-section">
        <Catalogue
          initialCategory={"CUSTOM_CAKES"}
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

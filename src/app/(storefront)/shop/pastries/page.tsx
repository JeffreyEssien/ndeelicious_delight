import type { Metadata } from "next";
import { Catalogue } from "@/components/product/catalogue";
import { ContentLines } from "@/components/ui/content-lines";
import { getCakeConfiguration, getStorefrontContent } from "@/lib/data/settings";
export const metadata: Metadata = { title: "Pastries", alternates: { canonical: "/shop/pastries" } };
export default async function Page() {
  const [content, cakeConfiguration] = await Promise.all([getStorefrontContent(), getCakeConfiguration()]);
  const header = content.headers.pastries;
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
          initialCategory="PASTRIES"
          cakeConfiguration={cakeConfiguration}
          budgetContent={content.shopBudget}
        />
      </section>
    </>
  );
}

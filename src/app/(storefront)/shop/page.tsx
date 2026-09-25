import type { Metadata } from "next";
import { Catalogue } from "@/components/product/catalogue";
import { ContentLines } from "@/components/ui/content-lines";
import { getStorefrontContent } from "@/lib/data/settings";
export const metadata: Metadata = { title: "Shop the bakery", description: "Browse the live bakery catalogue." };
export default async function ShopPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const [params, content] = await Promise.all([searchParams, getStorefrontContent()]);
  const category = params.category as "PASTRIES" | "READY_TO_BAKE" | "CUSTOM_CAKES" | undefined;
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
        <Catalogue initialCategory={category} />
      </section>
    </>
  );
}

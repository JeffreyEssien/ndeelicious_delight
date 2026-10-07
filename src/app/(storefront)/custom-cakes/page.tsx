import { getCustomerText } from "@/lib/customer-text";
import type { Metadata } from "next";
import Image from "next/image";
import { CakeBuilder } from "@/components/cakes/cake-builder";
import { ContentLines } from "@/components/ui/content-lines";
import { getCakeConfiguration, getStorefrontContent } from "@/lib/data/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getCustomerText("page titles");
  return {
    title: t("Build your custom cake"),
    description: t("Create a cake made especially for your celebration."),
    alternates: { canonical: "/custom-cakes" },
  };
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [content, configuration, params] = await Promise.all([
    getStorefrontContent(),
    getCakeConfiguration(),
    searchParams,
  ]);
  const recommendedValue = (type: "occasion" | "size" | "flavour" | "filling" | "design") => {
    const id = params[`${type}Id`];
    const legacyName = params[type];
    const option =
      typeof id === "string"
        ? configuration.options.find((item) => item.id === id && item.type === type && item.active)
        : undefined;
    return option?.name ?? (typeof legacyName === "string" ? legacyName : undefined);
  };
  const hero = content.customCakes.hero;
  return (
    <>
      <section className="cake-builder-hero">
        <div>
          <span className="overline">{hero.eyebrow}</span>
          <h1>
            <ContentLines text={hero.headline} />
          </h1>
          <p>{hero.supportingText} Choose a cake type to see its preparation time.</p>
        </div>
        <Image src={hero.image ?? ""} alt={hero.imageAlt ?? ""} fill priority sizes={"100vw"} />
      </section>
      <section className="site-container builder-wrap">
        <CakeBuilder
          configuration={configuration}
          initialSelection={
            params.recommended === "1"
              ? {
                  cakeTypeId: typeof params.cakeTypeId === "string" ? params.cakeTypeId : undefined,
                  occasion: recommendedValue("occasion"),
                  size: recommendedValue("size"),
                  flavour: recommendedValue("flavour"),
                  filling: recommendedValue("filling"),
                  design: recommendedValue("design"),
                }
              : undefined
          }
          budgetPreset={{ title: content.shopBudget.presetTitle, body: content.shopBudget.presetBody }}
        />
      </section>
    </>
  );
}

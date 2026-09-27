import type { Metadata } from "next";
import Image from "next/image";
import { CakeBuilder } from "@/components/cakes/cake-builder";
import { ContentLines } from "@/components/ui/content-lines";
import { getCakeConfiguration, getStorefrontContent } from "@/lib/data/settings";

export const metadata: Metadata = {
  title: "Build your custom cake",
  description: "Create a cake made especially for your celebration.",
};
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
          <p>
            {hero.supportingText} Most cakes need at least {configuration.leadTimeHours} hours.
          </p>
        </div>
        <Image src={hero.image ?? ""} alt={hero.imageAlt ?? ""} fill priority sizes="100vw" />
      </section>
      <section className="site-container builder-wrap">
        <CakeBuilder
          configuration={configuration}
          initialSelection={
            params.recommended === "1"
              ? {
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

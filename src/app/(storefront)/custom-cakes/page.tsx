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
                  occasion: typeof params.occasion === "string" ? params.occasion : undefined,
                  size: typeof params.size === "string" ? params.size : undefined,
                  flavour: typeof params.flavour === "string" ? params.flavour : undefined,
                  filling: typeof params.filling === "string" ? params.filling : undefined,
                  design: typeof params.design === "string" ? params.design : undefined,
                }
              : undefined
          }
          budgetPreset={{ title: content.shopBudget.presetTitle, body: content.shopBudget.presetBody }}
        />
      </section>
    </>
  );
}

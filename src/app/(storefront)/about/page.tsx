import Image from "next/image";
import Link from "next/link";
import { ContentLines } from "@/components/ui/content-lines";
import { Icon } from "@/components/ui/icons";
import { getStorefrontContent } from "@/lib/data/settings";

export default async function Page() {
  const { about } = await getStorefrontContent();
  return (
    <>
      <section className="split-hero about-hero">
        <div>
          <span className="overline">{about.hero.eyebrow}</span>
          <h1>
            <ContentLines text={about.hero.headline} />
          </h1>
          <p>{about.hero.supportingText}</p>
        </div>
        <div>
          <Image src={about.hero.image ?? ""} alt={about.hero.imageAlt ?? ""} fill priority />
        </div>
      </section>
      <section className="site-container story-section">
        <div>
          <span className="overline">{about.story.eyebrow}</span>
          <h2>
            <ContentLines text={about.story.headline} />
          </h2>
        </div>
        <div>
          {about.story.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </section>
      <section className="section section-tint">
        <div className="site-container values">
          {about.values.map((value, index) => (
            <div key={value.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{value.title}</h3>
              <p>{value.body}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="center-cta">
        <span className="overline">{about.cta.eyebrow}</span>
        <h2>{about.cta.headline}</h2>
        <Link href="/shop" className="button button-primary">
          {about.cta.buttonLabel} <Icon name="arrow" />
        </Link>
      </section>
    </>
  );
}

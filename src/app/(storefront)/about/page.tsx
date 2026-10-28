import { getCustomerText } from "@/lib/customer-text";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ContentLines } from "@/components/ui/content-lines";
import { Icon } from "@/components/ui/icons";
import { getStorefrontContent } from "@/lib/data/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getCustomerText("page titles");
  return { title: t("About"), alternates: { canonical: "/about" } };
}

export default async function Page() {
  const { about } = await getStorefrontContent();
  const { founder, vision } = about;
  return (
    <>
      <section className="site-container founder-section" aria-labelledby="founder-heading">
        <figure className="founder-portrait">
          <div className="founder-photo">
            {founder.image ? (
              <Image
                src={founder.image}
                alt={founder.imageAlt}
                fill
                priority
                sizes={"(max-width: 900px) 100vw, 40vw"}
              />
            ) : (
              // Until a photo is chosen in the admin, a monogram keeps the layout whole.
              <span className="founder-monogram" aria-hidden="true">
                {founder.name.trim().charAt(0) || "N"}
              </span>
            )}
          </div>
          <figcaption>
            <b>{founder.name}</b>
            <span>{founder.role}</span>
          </figcaption>
        </figure>
        <div className="founder-copy">
          <span className="overline">{founder.eyebrow}</span>
          <h1 id="founder-heading">
            <ContentLines text={founder.headline} />
          </h1>
          <p className="founder-motto">{founder.motto}</p>
          {founder.lead && <p className="founder-lead">{founder.lead}</p>}
          {founder.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {founder.highlights.length > 0 && (
            <ul className="founder-highlights">
              {founder.highlights.map((highlight) => (
                <li key={highlight.title}>
                  <b>{highlight.title}</b>
                  <span>{highlight.body}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <section className="vision-section" aria-labelledby="vision-heading">
        <div className="site-container vision-inner">
          <span className="overline">{vision.eyebrow}</span>
          <h2 id="vision-heading">
            <ContentLines text={vision.headline} />
          </h2>
          <p className="vision-statement">{vision.statement}</p>
          {vision.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {vision.closing && <p className="vision-closing">{vision.closing}</p>}
          {vision.signature && (
            <p className="vision-signature">
              {vision.signOff && <span>{vision.signOff}</span>}
              <b>{vision.signature}</b>
              {vision.signatureRole && <span>{vision.signatureRole}</span>}
            </p>
          )}
        </div>
      </section>
      {/* The brand line and its photo close the page (stored as the page's "hero" content). */}
      <section className="about-tagline">
        <div className="about-tagline-copy">
          <span className="overline">{about.hero.eyebrow}</span>
          <h2>
            <ContentLines text={about.hero.headline} />
          </h2>
          <p>{about.hero.supportingText}</p>
        </div>
        {about.hero.image && (
          <div className="about-tagline-image">
            <Image
              src={about.hero.image}
              alt={about.hero.imageAlt ?? ""}
              fill
              sizes={"(max-width: 800px) 100vw, 50vw"}
            />
          </div>
        )}
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

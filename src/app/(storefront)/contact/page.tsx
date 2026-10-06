import { getCustomerText } from "@/lib/customer-text";
import { whatsappUrl } from "@/lib/contact";
import type { Metadata } from "next";
import { ContactForm } from "@/components/forms/contact-form";
import { ContentLines } from "@/components/ui/content-lines";
import { getBusinessSettings, getStorefrontContent } from "@/lib/data/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getCustomerText("page titles");
  return { title: t("Contact"), alternates: { canonical: "/contact" } };
}

export default async function Page() {
  const t = await getCustomerText("Page: contact");

  const [content, business] = await Promise.all([getStorefrontContent(), getBusinessSettings()]);
  const phoneHref = business.phone.replace(/\D/g, "");
  const whatsapp = whatsappUrl(business.whatsapp);
  const location = business.address || [business.city, business.province, "Canada"].filter(Boolean).join(", ");
  return (
    <>
      <header className="page-hero">
        <span className="overline">{content.contact.hero.eyebrow}</span>
        <h1>
          <ContentLines text={content.contact.hero.headline} />
        </h1>
        <p>{content.contact.hero.supportingText}</p>
      </header>
      <section className="site-container contact-grid">
        <div className="contact-details">
          {business.contactEmail && (
            <div>
              <span>{t("Email")}</span>
              <a href={`mailto:${business.contactEmail}`}>{business.contactEmail}</a>
            </div>
          )}
          {business.phone && (
            <div>
              <span>{t("Phone")}</span>
              <a href={`tel:+${phoneHref}`}>{business.phone}</a>
            </div>
          )}
          {whatsapp && (
            <div>
              <span>{t("WhatsApp")}</span>
              <a href={whatsapp}>{t("Chat with us on WhatsApp")}</a>
            </div>
          )}
          {business.openingHours && (
            <div>
              <span>{t("Bakery hours")}</span>
              <p>{business.openingHours}</p>
            </div>
          )}
          {location && (
            <div>
              <span>{t("Location")}</span>
              <p>{location}</p>
            </div>
          )}
        </div>
        <ContactForm />
      </section>
    </>
  );
}

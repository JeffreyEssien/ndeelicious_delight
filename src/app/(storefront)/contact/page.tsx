import { getCustomerText } from "@/lib/customer-text";
import { whatsappUrl } from "@/lib/contact";
import type { Metadata } from "next";
import Image from "next/image";
import { ContactForm } from "@/components/forms/contact-form";
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
      <section className="contact-hero">
        <Image src={content.contact.hero.image || "/hero-bakery.jpg"} alt="" fill priority sizes="100vw" />
        <div className="contact-hero-shade" />
        <div className="contact-hero-card">
          <span className="overline">{content.contact.hero.eyebrow}</span>
          <h1>{t("Contact Us")}</h1>
        </div>
      </section>
      <section className="contact-section">
        <div className="site-container contact-grid">
          <div className="contact-intro">
            <h2>{t("Get In Touch")}</h2>
            <p>{content.contact.hero.supportingText}</p>
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
          </div>
          <div className="contact-form-wrap">
            <ContactForm />
          </div>
        </div>
      </section>
    </>
  );
}

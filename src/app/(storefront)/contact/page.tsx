import { whatsappUrl } from "@/lib/contact";
import type { Metadata } from "next";
import { ContactForm } from "@/components/forms/contact-form";
import { ContentLines } from "@/components/ui/content-lines";
import { getBusinessSettings, getStorefrontContent } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Contact", alternates: { canonical: "/contact" } };

export default async function Page() {
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
              <span>Email</span>
              <a href={`mailto:${business.contactEmail}`}>{business.contactEmail}</a>
            </div>
          )}
          {business.phone && (
            <div>
              <span>Phone</span>
              <a href={`tel:+${phoneHref}`}>{business.phone}</a>
            </div>
          )}
          {whatsapp && (
            <div>
              <span>WhatsApp</span>
              <a href={whatsapp}>Chat with us on WhatsApp</a>
            </div>
          )}
          {business.openingHours && (
            <div>
              <span>Bakery hours</span>
              <p>{business.openingHours}</p>
            </div>
          )}
          {location && (
            <div>
              <span>Location</span>
              <p>{location}</p>
            </div>
          )}
        </div>
        <ContactForm />
      </section>
    </>
  );
}

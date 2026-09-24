import { ContactForm } from "@/components/forms/contact-form";
import { ContentLines } from "@/components/ui/content-lines";
import { getBusinessSettings, getStorefrontContent } from "@/lib/data/settings";

export default async function Page() {
  const [content, business] = await Promise.all([getStorefrontContent(), getBusinessSettings()]);
  const phoneHref = business.phone.replace(/\D/g, "");
  const whatsapp = business.whatsapp.replace(/\D/g, "");
  return <><header className="page-hero"><span className="overline">{content.contact.hero.eyebrow}</span><h1><ContentLines text={content.contact.hero.headline} /></h1><p>{content.contact.hero.supportingText}</p></header><section className="site-container contact-grid"><div className="contact-details">{business.contactEmail&&<div><span>Email</span><a href={`mailto:${business.contactEmail}`}>{business.contactEmail}</a></div>}{business.phone&&<div><span>Phone</span><a href={`tel:+${phoneHref}`}>{business.phone}</a></div>}{whatsapp&&<div><span>WhatsApp</span><a href={`https://wa.me/${whatsapp}`}>{business.whatsapp}</a></div>}{business.openingHours&&<div><span>Bakery hours</span><p>{business.openingHours}</p></div>}{business.address&&<div><span>Location</span><p>{business.address}</p></div>}</div><ContactForm /></section></>;
}

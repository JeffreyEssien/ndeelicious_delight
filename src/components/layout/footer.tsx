import Link from "next/link";
import { NewsletterForm } from "./newsletter-form";
import { BrandLogo } from "@/components/layout/brand-logo";
import type { BusinessSettings, StorefrontContent } from "@/types/content";
export function Footer({ content, business }: { content: StorefrontContent["global"]; business: BusinessSettings }) {
  const whatsapp = business.whatsapp.replace(/\D/g, "");
  return (
    <footer className="site-footer">
      <div className="site-container footer-grid">
        <div className="footer-intro">
          <div className="brand brand-light">
            <BrandLogo />
          </div>
          <p>{content.footerDescription}</p>
          <div className="socials">
            {business.instagramUrl && (
              <a href={business.instagramUrl} aria-label="Instagram">
                ig
              </a>
            )}
            {whatsapp && (
              <a href={`https://wa.me/${whatsapp}`} aria-label="WhatsApp">
                wa
              </a>
            )}
          </div>
        </div>
        <div>
          <h3>Explore</h3>
          {content.navigation.map((item) => (
            <Link href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </div>
        <div>
          <h3>Visit & help</h3>
          <Link href="/delivery-information">Delivery information</Link>
          <Link href="/faq">Frequently asked</Link>
          <Link href="/contact">Contact us</Link>
        </div>
        <div className="footer-news">
          <h3>{content.newsletterTitle}</h3>
          <p>{content.newsletterText}</p>
          <NewsletterForm />
        </div>
      </div>
      <div className="site-container footer-base">
        <span>
          © {new Date().getFullYear()} {business.businessName}
        </span>
        <nav>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/refund-policy">Refunds</Link>
        </nav>
      </div>
    </footer>
  );
}

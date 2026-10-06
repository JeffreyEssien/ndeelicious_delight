"use client";
import { useCustomerText } from "@/components/customer-text-provider";
import { whatsappUrl } from "@/lib/contact";
import Link from "next/link";
import { NewsletterForm } from "./newsletter-form";
import { BrandLogo } from "@/components/layout/brand-logo";
import type { BusinessSettings, StorefrontContent } from "@/types/content";
export function Footer({ content, business }: { content: StorefrontContent["global"]; business: BusinessSettings }) {
  const t = useCustomerText("footer");

  const whatsapp = whatsappUrl(business.whatsapp);
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
              <a href={business.instagramUrl} aria-label={t("Instagram")}>
                {t("ig")}
              </a>
            )}
            {whatsapp && (
              <a href={whatsapp} aria-label={t("WhatsApp")}>
                {t("wa")}
              </a>
            )}
          </div>
        </div>
        <div>
          <h3>{t("Explore")}</h3>
          {content.navigation.map((item) => (
            <Link href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </div>
        <div>
          <h3>{t("Visit & help")}</h3>
          <Link href="/delivery-information">{t("Delivery information")}</Link>
          <Link href="/faq">{t("Frequently asked")}</Link>
          <Link href="/contact">{t("Contact us")}</Link>
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
          <Link href="/privacy">{t("Privacy")}</Link>
          <Link href="/terms">{t("Terms")}</Link>
          <Link href="/refund-policy">{t("Returns & cancellations")}</Link>
        </nav>
      </div>
    </footer>
  );
}

import { getCustomerText } from "@/lib/customer-text";
import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Providers } from "@/components/providers";
import { getDeliveryZones, getProducts } from "@/lib/data/catalog";
import { getBusinessSettings, getStoreAppearance, getStoreTheme } from "@/lib/data/settings";
import { resolveThemeTokens } from "@/lib/theme/tokens";
import "../store.css";
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function Layout({ children }: { children: React.ReactNode }) {
  const t = await getCustomerText("layout");

  const [products, deliveryZones, initialTheme, business, appearance] = await Promise.all([
    getProducts(),
    getDeliveryZones(),
    getStoreTheme(),
    getBusinessSettings(),
    getStoreAppearance(),
  ]);
  return (
    <Providers
      products={products}
      deliveryZones={deliveryZones}
      initialTheme={initialTheme}
      business={business}
      themeTokens={resolveThemeTokens(initialTheme, appearance)}
    >
      <a className="skip-link" href="#checkout-main-content">
        {t("Skip to checkout")}
      </a>
      <header className="checkout-header">
        <Link className="brand" href="/" aria-label={t("Ndeeelicious Delight home")}>
          <BrandLogo compact priority />
        </Link>
        <span>{t("Secure checkout")}</span>
      </header>
      <main className="checkout-main" id="checkout-main-content" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-container checkout-policy-links">
        <nav aria-label={t("Checkout policies and support")}>
          <Link href="/refund-policy">{t("Returns & cancellations")}</Link>
          <Link href="/delivery-information">{t("Delivery & pickup")}</Link>
          <Link href="/terms">{t("Terms")}</Link>
          <Link href="/privacy">{t("Privacy")}</Link>
          <Link href="/contact">{t("Contact us")}</Link>
        </nav>
      </footer>
    </Providers>
  );
}

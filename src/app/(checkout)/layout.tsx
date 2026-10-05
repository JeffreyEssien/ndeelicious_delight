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
        Skip to checkout
      </a>
      <header className="checkout-header">
        <Link className="brand" href="/" aria-label="Ndeeelicious Delight home">
          <BrandLogo compact priority />
        </Link>
        <span>Secure checkout</span>
      </header>
      <main className="checkout-main" id="checkout-main-content" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-container checkout-policy-links">
        <nav aria-label="Checkout policies and support">
          <Link href="/refund-policy">Returns & cancellations</Link>
          <Link href="/delivery-information">Delivery & pickup</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/contact">Contact us</Link>
        </nav>
      </footer>
    </Providers>
  );
}

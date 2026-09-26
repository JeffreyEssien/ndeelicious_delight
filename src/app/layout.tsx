import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { getDeliveryZones, getProducts } from "@/lib/data/catalog";
import { getBusinessSettings, getStoreAppearance, getStorefrontContent, getStoreTheme } from "@/lib/data/settings";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";
import "./store.css";
import "./admin.css";
import "./extras.css";
import "./gallery.css";
import "./reviews.css";
import "./documents.css";
import "./carousel.css";
import "./budget.css";

type StoreStyle = CSSProperties & { [key: `--${string}`]: string | number };

export async function generateMetadata(): Promise<Metadata> {
  const [content, business] = await Promise.all([getStorefrontContent(), getBusinessSettings()]);
  return {
    metadataBase: new URL(getSiteUrl()),
    title: {
      default: `${business.businessName} — Cakes & Pastries`,
      template: `%s · ${business.businessName}`,
    },
    description: content.home.hero.supportingText,
    openGraph: {
      title: business.businessName,
      description: content.home.hero.headline.replaceAll("\n", " "),
      images: content.home.hero.image ? [content.home.hero.image] : [],
    },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [products, deliveryZones, initialTheme, business, appearance] = await Promise.all([
    getProducts(),
    getDeliveryZones(),
    getStoreTheme(),
    getBusinessSettings(),
    getStoreAppearance(),
  ]);
  const customColors: StoreStyle = appearance.useCustomColors
    ? ({
        "--bg": appearance.colors.background,
        "--surface": appearance.colors.surface,
        "--ink": appearance.colors.text,
        "--muted": appearance.colors.mutedText,
        "--berry": appearance.colors.primary,
        "--berry-dark": appearance.colors.primaryDark,
        "--accent": appearance.colors.accent,
      } satisfies StoreStyle)
    : {};
  const storeStyle: StoreStyle = { ...customColors, "--product-columns": appearance.productColumns };
  return (
    <html
      lang={business.locale}
      data-scroll-behavior="smooth"
      data-theme={initialTheme}
      data-content-width={appearance.contentWidth}
      data-section-spacing={appearance.sectionSpacing}
      data-corners={appearance.cornerStyle}
      style={storeStyle}
    >
      <body>
        <Providers products={products} deliveryZones={deliveryZones} initialTheme={initialTheme} business={business}>
          {children}
        </Providers>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { getDeliveryZones, getProducts } from "@/lib/data/catalog";
import { getBusinessSettings, getStorefrontContent, getStoreTheme } from "@/lib/data/settings";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";
import "./store.css";
import "./admin.css";
import "./extras.css";
import "./gallery.css";
import "./reviews.css";

export async function generateMetadata(): Promise<Metadata> {
  const [content, business] = await Promise.all([getStorefrontContent(), getBusinessSettings()]);
  return {
    metadataBase: new URL(getSiteUrl()),
    title: {
      default: `${business.businessName} — Cakes & Pastries in Lagos`,
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
  const [products, deliveryZones, initialTheme] = await Promise.all([
    getProducts(),
    getDeliveryZones(),
    getStoreTheme(),
  ]);
  return (
    <html lang="en" data-scroll-behavior="smooth" data-theme={initialTheme}>
      <body>
        <Providers products={products} deliveryZones={deliveryZones} initialTheme={initialTheme}>
          {children}
        </Providers>
      </body>
    </html>
  );
}

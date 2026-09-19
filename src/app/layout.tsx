import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { getDeliveryZones, getProducts } from "@/lib/data/catalog";
import { getStoreTheme } from "@/lib/data/settings";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";
import "./store.css";
import "./admin.css";
import "./extras.css";
import "./gallery.css";
import "./reviews.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: { default: "Ndeeelicious Delight — Cakes & Pastries in Lagos", template: "%s · Ndeeelicious Delight" },
  description: "Celebration cakes, fresh pastries and ready-to-bake favourites, thoughtfully made in Lagos.",
  openGraph: { title:"Ndeeelicious Delight", description:"Made for life’s sweetest moments.", images:["/hero-bakery.jpg"] },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [products, deliveryZones, initialTheme] = await Promise.all([getProducts(), getDeliveryZones(), getStoreTheme()]);
  return (
    <html lang="en" data-scroll-behavior="smooth" data-theme={initialTheme}>
      <body><Providers products={products} deliveryZones={deliveryZones} initialTheme={initialTheme}>{children}</Providers></body>
    </html>
  );
}

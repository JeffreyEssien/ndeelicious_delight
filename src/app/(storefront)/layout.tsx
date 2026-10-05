import { StorefrontShell } from "@/components/layout/storefront-shell";
import { Providers } from "@/components/providers";
import { getDeliveryZones, getProducts } from "@/lib/data/catalog";
import { getBusinessSettings, getStoreAppearance, getStoreTheme } from "@/lib/data/settings";
import { resolveThemeTokens } from "@/lib/theme/tokens";
import "../store.css";
import "../extras.css";
import "../gallery.css";
import "../reviews.css";
import "../budget.css";

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
      <StorefrontShell>{children}</StorefrontShell>
    </Providers>
  );
}

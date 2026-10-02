import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { Providers } from "@/components/providers";
import { getBusinessSettings, getStoreAppearance, getStoreTheme } from "@/lib/data/settings";
import { resolveThemeTokens } from "@/lib/theme/tokens";
import "../admin.css";

export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

export default async function Layout({ children }: { children: React.ReactNode }) {
  const [initialTheme, business, appearance] = await Promise.all([
    getStoreTheme(),
    getBusinessSettings(),
    getStoreAppearance(),
  ]);
  return (
    <Providers
      products={[]}
      deliveryZones={[]}
      initialTheme={initialTheme}
      business={business}
      themeTokens={resolveThemeTokens(initialTheme, appearance)}
    >
      <AdminShell>{children}</AdminShell>
    </Providers>
  );
}

import type { CSSProperties } from "react";
import type { Metadata } from "next";
import {
  getBusinessSettings,
  getMarketingExport,
  getStoreAppearance,
  getStorefrontContent,
  getStoreTheme,
} from "@/lib/data/settings";
import { organizationJsonLd, serializeJsonLd } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-url";
import { resolveThemeTokens, themeTokenCss } from "@/lib/theme/tokens";
import "./globals.css";

type StoreStyle = CSSProperties & { [key: `--${string}`]: string | number };

export async function generateMetadata(): Promise<Metadata> {
  const [content, business] = await Promise.all([getStorefrontContent(), getBusinessSettings()]);
  const title = `${business.businessName} — Cakes & Pastries`;
  const description = content.home.hero.supportingText;
  const image = content.home.hero.image;
  return {
    metadataBase: new URL(getSiteUrl()),
    title: {
      default: title,
      template: `%s · ${business.businessName}`,
    },
    description,
    openGraph: {
      title,
      description,
      siteName: business.businessName,
      locale: business.locale.replace("-", "_"),
      type: "website",
      images: image ? [{ url: image, alt: content.home.hero.imageAlt || business.businessName }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [{ url: image, alt: content.home.hero.imageAlt || business.businessName }] : [],
    },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [initialTheme, business, appearance, marketing] = await Promise.all([
    getStoreTheme(),
    getBusinessSettings(),
    getStoreAppearance(),
    getMarketingExport(),
  ]);
  const organization = organizationJsonLd({ business, logoUrl: marketing.logoUrl, siteUrl: getSiteUrl() });
  const themeTokens = resolveThemeTokens(initialTheme, appearance);
  const storeStyle: StoreStyle = {
    ...themeTokenCss(themeTokens),
    "--product-columns": appearance.productColumns,
  };
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
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: serializeJsonLd escapes HTML-significant characters. */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(organization) }} />
        {children}
      </body>
    </html>
  );
}

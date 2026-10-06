import { customerText } from "@/content/customer-text";
import { CustomerTextProvider } from "@/components/customer-text-provider";
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
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
import "./carousel.css";

type StoreStyle = CSSProperties & { [key: `--${string}`]: string | number };

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const [content, business] = await Promise.all([getStorefrontContent(), getBusinessSettings()]);
  const t = customerText(content.customerText, "page titles");
  const title = t("{business} — Custom Cakes & Nigerian-Style Pies", { business: business.businessName });
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
  await connection();
  const [initialTheme, business, appearance, marketing, content] = await Promise.all([
    getStoreTheme(),
    getBusinessSettings(),
    getStoreAppearance(),
    getMarketingExport(),
    getStorefrontContent(),
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
        <CustomerTextProvider copy={content.customerText}>{children}</CustomerTextProvider>
      </body>
    </html>
  );
}

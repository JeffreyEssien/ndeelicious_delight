import { mergeCustomerText } from "@/content/customer-text";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import type { StoreTheme } from "@/lib/theme/tokens";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  BusinessSettings,
  CakeConfigurationData,
  CakeOption,
  StoreAppearance,
  StoreCarousel,
  StorefrontContent,
  MarketingExport,
} from "@/types/content";
import {
  businessSettingsSchema,
  storeAppearanceSchema,
  storeCarouselSchema,
  storefrontContentSchema,
  marketingExportSchema,
} from "@/validations/settings";

export const defaultStoreCarousel: StoreCarousel = {
  enabled: false,
  eyebrow: "From our kitchen",
  headline: "Today’s favourites",
  body: "Browse a few of our most-loved bakes, made fresh for every celebration.",
  productIds: [],
  style: "editorial",
  autoplay: false,
  intervalMs: 6000,
  loop: true,
  showPrices: true,
  showAddToCart: true,
};

export const defaultStoreAppearance: StoreAppearance = {
  useCustomColors: false,
  colors: {
    background: "#faf8f5",
    surface: "#ffffff",
    text: "#211c19",
    mutedText: "#706965",
    primary: "#792f49",
    primaryDark: "#5d2137",
    accent: "#c89b49",
  },
  contentWidth: "standard",
  sectionSpacing: "comfortable",
  cornerStyle: "soft",
  productColumns: 4,
};

export const defaultMarketingExport: MarketingExport = {
  headline: "Made fresh for you",
  callToAction: "Order online",
  websiteUrl: "",
  format: "portrait",
  template: "brand",
  showLogo: true,
  showPrice: true,
  showSafeZone: true,
  logoUrl: "/WhatsApp Image 2026-09-15 at 22.16.43.jpeg",
  productIds: [],
};

async function setting<T>(key: string, client?: SupabaseClient): Promise<T> {
  const db = client ?? createServiceClient();
  const { data, error } = await db.from("site_settings").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  if (data?.value === null || data?.value === undefined) throw new Error(`Missing site setting: ${key}`);
  return data.value as T;
}

const cachedSetting = unstable_cache((key: string) => setting<unknown>(key), ["storefront-setting"], {
  tags: ["storefront"],
  revalidate: 300,
});

async function readStoreTheme(client?: SupabaseClient): Promise<StoreTheme> {
  try {
    const { data } = await (client ?? createServiceClient())
      .from("site_settings")
      .select("value")
      .eq("key", "theme")
      .maybeSingle();
    const theme = String(data?.value);
    return ["berry", "purple", "sunrise"].includes(theme) ? (theme as StoreTheme) : "berry";
  } catch {
    return "berry";
  }
}

const cachedStoreTheme = unstable_cache(() => readStoreTheme(), ["storefront-theme"], {
  tags: ["storefront"],
  revalidate: 300,
});

export async function getStoreTheme(client?: SupabaseClient): Promise<StoreTheme> {
  return client ? readStoreTheme(client) : cachedStoreTheme();
}

export function getBusinessSettings(client?: SupabaseClient) {
  return (client ? setting<BusinessSettings>("business", client) : cachedSetting("business")).then((value) =>
    businessSettingsSchema.parse(value),
  );
}

export function getStorefrontContent(client?: SupabaseClient) {
  return (client ? setting<StorefrontContent>("content", client) : cachedSetting("content")).then((value) =>
    (() => {
      const content = storefrontContentSchema.parse(value);
      return { ...content, customerText: mergeCustomerText(content.customerText) };
    })(),
  );
}

export async function getStoreAppearance(client?: SupabaseClient): Promise<StoreAppearance> {
  try {
    const value = client ? await setting<StoreAppearance>("appearance", client) : await cachedSetting("appearance");
    return storeAppearanceSchema.parse(value);
  } catch (error) {
    if (error instanceof Error && error.message === "Missing site setting: appearance") return defaultStoreAppearance;
    throw error;
  }
}

export async function getStoreCarousel(client?: SupabaseClient): Promise<StoreCarousel> {
  try {
    const value = client ? await setting<StoreCarousel>("carousel", client) : await cachedSetting("carousel");
    return storeCarouselSchema.parse(value);
  } catch (error) {
    if (error instanceof Error && error.message === "Missing site setting: carousel") return defaultStoreCarousel;
    throw error;
  }
}

export async function getMarketingExport(client?: SupabaseClient): Promise<MarketingExport> {
  try {
    const value = client ? await setting<MarketingExport>("marketing", client) : await cachedSetting("marketing");
    return marketingExportSchema.parse(value);
  } catch (error) {
    if (error instanceof Error && error.message === "Missing site setting: marketing") return defaultMarketingExport;
    throw error;
  }
}

export async function getCakeConfiguration(client?: SupabaseClient): Promise<CakeConfigurationData> {
  const db = client ?? createServiceClient();
  const [{ data, error }, business] = await Promise.all([
    db
      .from("custom_cake_options")
      .select("id,type,name,description,price_adjustment,quote_required,active,sort_order")
      .order("type")
      .order("sort_order"),
    getBusinessSettings(db),
  ]);
  if (error) throw error;
  const options = (data ?? []).map(
    (row): CakeOption => ({
      id: row.id,
      type: row.type as CakeOption["type"],
      name: row.name,
      description: row.description ?? "",
      priceAdjustment: row.price_adjustment,
      quoteRequired: row.quote_required,
      active: row.active,
      sortOrder: row.sort_order,
    }),
  );
  return { options, leadTimeHours: Number(business.cakeLeadHours) };
}

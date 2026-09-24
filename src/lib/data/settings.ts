import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoreTheme } from "@/components/providers";
import { createServiceClient } from "@/lib/supabase/service";
import type { BusinessSettings, CakeConfigurationData, CakeOption, StorefrontContent } from "@/types/content";

async function setting<T>(key: string, client?: SupabaseClient): Promise<T> {
  const db = client ?? createServiceClient();
  const { data, error } = await db.from("site_settings").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  if (data?.value === null || data?.value === undefined) throw new Error(`Missing site setting: ${key}`);
  return data.value as T;
}

export async function getStoreTheme(): Promise<StoreTheme> {
  try {
    const { data } = await createServiceClient().from("site_settings").select("value").eq("key", "theme").maybeSingle();
    const theme = String(data?.value);
    return ["berry", "purple", "sunrise"].includes(theme) ? (theme as StoreTheme) : "berry";
  } catch {
    return "berry";
  }
}

export function getBusinessSettings(client?: SupabaseClient) {
  return setting<BusinessSettings>("business", client);
}

export function getStorefrontContent(client?: SupabaseClient) {
  return setting<StorefrontContent>("content", client);
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

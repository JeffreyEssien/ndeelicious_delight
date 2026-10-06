import { customerText } from "@/content/customer-text";
import { getBusinessSettings, getStorefrontContent } from "@/lib/data/settings";
import type { SupabaseClient } from "@supabase/supabase-js";
export async function getCustomerText(group: string, db?: SupabaseClient) {
  const content = await getStorefrontContent(db);
  return customerText(content.customerText, group);
}

export async function getCustomerEmailText(db?: SupabaseClient) {
  const [t, business] = await Promise.all([getCustomerText("emails", db), getBusinessSettings(db)]);
  return { t, frame: { businessName: business.businessName, footer: t("Made with care.") } };
}

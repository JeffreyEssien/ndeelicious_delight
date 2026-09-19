import type { StoreTheme } from "@/components/providers";
import { createServiceClient } from "@/lib/supabase/service";

export async function getStoreTheme(): Promise<StoreTheme> {
  try {
    const { data } = await createServiceClient().from("site_settings").select("value").eq("key", "theme").maybeSingle();
    const theme = String(data?.value);
    return ["berry", "purple", "sunrise"].includes(theme) ? (theme as StoreTheme) : "berry";
  } catch {
    return "berry";
  }
}

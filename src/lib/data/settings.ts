import type { StoreTheme } from "@/components/providers";
import { createServiceClient } from "@/lib/supabase/service";

export async function getStoreTheme():Promise<StoreTheme>{
  try{const {data}=await createServiceClient().from("site_settings").select("value").eq("key","theme").maybeSingle();return ["berry","purple","sunrise"].includes(String(data?.value))?data!.value as StoreTheme:"berry"}catch{return "berry"}
}

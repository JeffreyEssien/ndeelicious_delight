import type { SupabaseClient } from "@supabase/supabase-js";

export async function isActiveAdmin(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("admins")
    .select("id")
    .eq("auth_user_id", userId)
    .eq("active", true)
    .maybeSingle();

  return !error && Boolean(data);
}

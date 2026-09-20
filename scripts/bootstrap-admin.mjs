import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const name = process.env.ADMIN_NAME?.trim() || "Ndeeelicious Owner";

if (!url || !serviceRoleKey) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
}

if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
  throw new Error("Set ADMIN_EMAIL in .env.local to the owner's real email address.");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { error: adminError } = await supabase
  .from("admins")
  .upsert({ email, name, role: "OWNER", active: true }, { onConflict: "email" });
if (adminError) throw adminError;

console.log(`Admin ready: ${email}. The first-party OTP form is available at /admin/login.`);
